'use strict';   
/** Hide a DOM element. */
function hideElement(el) {
el.style.display = 'none';
}

/** Show a DOM element that has been hidden. */
function showElement(el) {
el.style.display = 'block';
}

/**
 * Defines an instance of the Locator+ solution, to be instantiated
 * when the Maps library is loaded.
 */
function LocatorPlus(configuration) {
const locator = this;

locator.locations = configuration.locations || [];
locator.capabilities = configuration.capabilities || {};

const mapEl = document.getElementById('map');
locator.panelListEl = document.getElementById('locations-panel-list');
const sectionNameEl =
    document.getElementById('location-results-section-name');
const resultsContainerEl = document.getElementById('location-results-list');

const itemsTemplate = Handlebars.compile(
    document.getElementById('locator-result-items-tmpl').innerHTML);

locator.searchLocation = null;
locator.searchLocationMarker = null;
locator.selectedLocationIdx = null;
locator.userCountry = null;

// Initialize the map -------------------------------------------------------
const mapOptions = configuration.mapOptions;
locator.map = new google.maps.Map(mapEl, {
    fullscreenControl: mapOptions.fullscreenControl,
    zoomControl: mapOptions.zoomControl,
    streetViewControl: mapOptions.streetViewControl,
    mapTypeControl: mapOptions.mapTypeControl,
    mapTypeControlOptions: {
    position: google.maps.ControlPosition.TOP_RIGHT,
    },
});

// Store selection.
const selectResultItem = function(locationIdx, panToMarker) {
    locator.selectedLocationIdx = locationIdx;
    for (let locationElem of resultsContainerEl.children) {
    locationElem.classList.remove('selected');
    if (getResultIndex(locationElem) === locator.selectedLocationIdx) {
        locationElem.classList.add('selected');
    }
    }
    if (panToMarker && (locationIdx != null)) {
    locator.map.panTo(locator.locations[locationIdx].coords);
    }
};

// Create a marker for each location.
var iconBase = 'https://cdn.shopify.com/s/files/1/0257/8605/6753/files/Pin_1.png?v=1613646379';
//var iconBase = 'https://maps.google.com/mapfiles/kml/shapes/'
var icons = {
    icon: iconBase + 'parking_lot_maps.png'
};
const markers = locator.locations.map(function(location, index) {
    const marker = new google.maps.Marker({
    position: location.coords,
    icon: icons.icon,
    map: locator.map,
    title: location.title,
    });
    marker.addListener('click', function() {
    selectResultItem(index, false);
    });
    return marker;
});

// Fit map to marker bounds.
locator.updateBounds = function() {
    const bounds = new google.maps.LatLngBounds();
    if (locator.searchLocationMarker) {
    bounds.extend(locator.searchLocationMarker.getPosition());
    }
    for (let i = 0; i < markers.length; i++) {
    bounds.extend(markers[i].getPosition());
    }
    locator.map.fitBounds(bounds);
};
locator.updateBounds();

// Get the distance of a store location to the user's location,
// used in sorting the list.
const getLocationDistance = function(location) {
    if (!locator.searchLocation) return null;

    // Use travel distance if available (from Distance Matrix).
    if (location.travelDistanceValue != null) {
    return location.travelDistanceValue;
    }

    // Fall back to straight-line distance.
    return google.maps.geometry.spherical.computeDistanceBetween(
        new google.maps.LatLng(location.coords),
        locator.searchLocation.location);
};

// Render the results list --------------------------------------------------
const getResultIndex = function(elem) {
    return parseInt(elem.getAttribute('data-location-index'));
};

locator.renderResultsList = function() {
    let locations = locator.locations.slice();
    for (let i = 0; i < locations.length; i++) {
    locations[i].index = i;
    }
    if (locator.searchLocation) {
    sectionNameEl.textContent =
        'Tus sucursales más cercanas (' + locations.length + ')';
    locations.sort(function(a, b) {
        return getLocationDistance(a) - getLocationDistance(b);
    });
    } else {
    sectionNameEl.textContent = `Todas las sucursales (${locations.length})`;
    }
    const resultItemContext = {
    locations: locations,
    showDirectionsButton: !!locator.searchLocation
    };
    resultsContainerEl.innerHTML = itemsTemplate(resultItemContext);
    for (let item of resultsContainerEl.children) {
    const resultIndex = getResultIndex(item);
    if (resultIndex === locator.selectedLocationIdx) {
        item.classList.add('selected');
    }

    const resultSelectionHandler = function() {
        if (resultIndex !== locator.selectedLocationIdx) {
        locator.clearDirections();
        }
        selectResultItem(resultIndex, true);
    };

    // Clicking anywhere on the item selects this location.
    // Additionally, create a button element to make this behavior
    // accessible under tab navigation.
    item.addEventListener('click', resultSelectionHandler);
    item.querySelector('.select-location')
        .addEventListener('click', function(e) {
            resultSelectionHandler();
            e.stopPropagation();
        });

    item.querySelector('.details-button')
        .addEventListener('click', function() {
            locator.showDetails(resultIndex);
        });
    item.querySelector('.show-directions')
        .addEventListener('click', function(e) {
        selectResultItem(resultIndex, false);
        locator.updateDirections();
        e.stopPropagation();
        });

    if (resultItemContext.showDirectionsButton) {
        item.querySelector('.show-directions')
            .addEventListener('click', function(e) {
            selectResultItem(resultIndex, false);
            locator.updateDirections();
            e.stopPropagation();
            });
    }
    }
};

// Optional capability initialization --------------------------------------
initializeSearchInput(locator);
initializeDistanceMatrix(locator);
initializeDirections(locator);
initializeDetails(locator);

// Initial render of results -----------------------------------------------
locator.renderResultsList();
}

/** When the search input capability is enabled, initialize it. */
function initializeSearchInput(locator) {
const geocodeCache = new Map();
const geocoder = new google.maps.Geocoder();

const searchInputEl = document.getElementById('location-search-input');
const searchButtonEl = document.getElementById('location-search-button');

const updateSearchLocation = function(address, location) {
    if (locator.searchLocationMarker) {
    locator.searchLocationMarker.setMap(null);
    }
    if (!location) {
    locator.searchLocation = null;
    return;
    }
    locator.searchLocation = {'address': address, 'location': location};
    locator.searchLocationMarker = new google.maps.Marker({
    position: location,
    map: locator.map,
    title: 'My location',
    icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: '#3367D6',
        fillOpacity: 0.5,
        strokeOpacity: 0,
    }
    });

    // Update the locator's idea of the user's country, used for units. Use
    // `formatted_address` instead of the more structured `address_components`
    // to avoid an additional billed call.
    const addressParts = address.split(' ');
    locator.userCountry = addressParts[addressParts.length - 1];

    // Update map bounds to include the new location marker.
    locator.updateBounds();

    // Update the result list so we can sort it by proximity.
    locator.renderResultsList();

    locator.updateTravelTimes();

    locator.clearDirections();
};

const geocodeSearch = function(query) {
    if (!query) {
    return;
    }

    const handleResult = function(geocodeResult) {
    searchInputEl.value = geocodeResult.formatted_address;
    updateSearchLocation(
        geocodeResult.formatted_address, geocodeResult.geometry.location);
    };

    if (geocodeCache.has(query)) {
    handleResult(geocodeCache.get(query));
    return;
    }
    const request = {address: query, bounds: locator.map.getBounds()};
    geocoder.geocode(request, function(results, status) {
    if (status === 'OK') {
        if (results.length > 0) {
        const result = results[0];
        geocodeCache.set(query, result);
        handleResult(result);
        }
    }
    });
};

// Set up geocoding on the search input.
searchButtonEl.addEventListener('click', function() {
    geocodeSearch(searchInputEl.value.trim());
});

// Initialize Autocomplete.
initializeSearchInputAutocomplete(
    locator, searchInputEl, geocodeSearch, updateSearchLocation);
}

/** Add Autocomplete to the search input. */
function initializeSearchInputAutocomplete(
    locator, searchInputEl, fallbackSearch, searchLocationUpdater) {
// Set up Autocomplete on the search input. Bias results to map viewport.
const autocomplete = new google.maps.places.Autocomplete(searchInputEl, {
    types: ['geocode'],
    fields: ['place_id', 'formatted_address', 'geometry.location']
});
autocomplete.bindTo('bounds', locator.map);
autocomplete.addListener('place_changed', function() {
    const placeResult = autocomplete.getPlace();
    if (!placeResult.geometry) {
    // Hitting 'Enter' without selecting a suggestion will result in a
    // placeResult with only the text input value as the 'name' field.
    fallbackSearch(placeResult.name);
    return;
    }
    searchLocationUpdater(
        placeResult.formatted_address, placeResult.geometry.location);
});
}

/** Initialize Distance Matrix for the locator. */
function initializeDistanceMatrix(locator) {
const distanceMatrixService = new google.maps.DistanceMatrixService();

// Annotate travel times to the selected location using Distance Matrix.
locator.updateTravelTimes = function() {
    if (!locator.searchLocation) return;

    const units = (locator.userCountry === 'USA') ?
        google.maps.UnitSystem.IMPERIAL :
        google.maps.UnitSystem.METRIC;
    const request = {
    origins: [locator.searchLocation.location],
    destinations: locator.locations.map(function(x) {
        return x.coords;
    }),
    travelMode: google.maps.TravelMode.DRIVING,
    unitSystem: units,
    };
    const callback = function(response, status) {
    if (status === 'OK') {
        const distances = response.rows[0].elements;
        for (let i = 0; i < distances.length; i++) {
        const distResult = distances[i];
        let travelDistanceText, travelDistanceValue;
        if (distResult.status === 'OK') {
            travelDistanceText = distResult.distance.text;
            travelDistanceValue = distResult.distance.value;
        }
        const location = locator.locations[i];
        location.travelDistanceText = travelDistanceText;
        location.travelDistanceValue = travelDistanceValue;
        }

        // Re-render the results list, in case the ordering has changed.
        locator.renderResultsList();
    }
    };
    distanceMatrixService.getDistanceMatrix(request, callback);
};
}

/** Initialize Directions service for the locator. */
function initializeDirections(locator) {
const directionsCache = new Map();
const directionsService = new google.maps.DirectionsService();
const directionsRenderer = new google.maps.DirectionsRenderer({
    suppressMarkers: true,
});

// Update directions displayed from the search location to
// the selected location on the map.
locator.updateDirections = function() {
    if (!locator.searchLocation || (locator.selectedLocationIdx == null)) {
    return;
    }
    const cacheKey = JSON.stringify(
        [locator.searchLocation.location, locator.selectedLocationIdx]);
    if (directionsCache.has(cacheKey)) {
    const directions = directionsCache.get(cacheKey);
    directionsRenderer.setMap(locator.map);
    directionsRenderer.setDirections(directions);
    return;
    }
    const request = {
    origin: locator.searchLocation.location,
    destination: locator.locations[locator.selectedLocationIdx].coords,
    travelMode: google.maps.TravelMode.DRIVING
    };
    directionsService.route(request, function(response, status) {
    if (status === 'OK') {
        directionsRenderer.setMap(locator.map);
        directionsRenderer.setDirections(response);
        directionsCache.set(cacheKey, response);
    }
    });
};

locator.clearDirections = function() {
    directionsRenderer.setMap(null);
};
}

/** Initialize Place Details service and UI for the locator. */
function initializeDetails(locator) {
const panelDetailsEl = document.getElementById('locations-panel-details');
const detailsService = new google.maps.places.PlacesService(locator.map);

const detailsTemplate = Handlebars.compile(
    document.getElementById('locator-details-tmpl').innerHTML);

const renderDetails = function(context) {
    panelDetailsEl.innerHTML = detailsTemplate(context);
    panelDetailsEl.querySelector('.back-button')
        .addEventListener('click', hideDetails);
};

const hideDetails = function() {
    showElement(locator.panelListEl);
    hideElement(panelDetailsEl);
};

locator.showDetails = function(locationIndex) {
    const location = locator.locations[locationIndex];
    const context = {location};

    // Helper function to create a fixed-size array.
    const initArray = function(arraySize) {
    const array = [];
    while (array.length < arraySize) {
        array.push(0);
    }
    return array;
    };

    if (location.placeId) {
    const request = {
        placeId: location.placeId,
        fields: [
        'formatted_phone_number', 'website', 'opening_hours', 'url',
        'utc_offset_minutes', 'price_level', 'rating', 'user_ratings_total'
        ]
    };
    detailsService.getDetails(request, function(place, status) {
        if (status == google.maps.places.PlacesServiceStatus.OK) {
        if (place.opening_hours) {
            const daysHours =
                place.opening_hours.weekday_text.map(e => e.split(/\:\s+/))
                    .map(e => ({'days': e[0].substr(0, 3), 'hours': e[1]}));

            for (let i = 1; i < daysHours.length; i++) {
            if (daysHours[i - 1].hours === daysHours[i].hours) {
                if (daysHours[i - 1].days.indexOf('-') !== -1) {
                daysHours[i - 1].days =
                    daysHours[i - 1].days.replace(/\w+$/, daysHours[i].days);
                } else {
                daysHours[i - 1].days += ' - ' + daysHours[i].days;
                }
                daysHours.splice(i--, 1);
            }
            }
            place.openingHoursSummary = daysHours;
        }
        if (place.rating) {
            const starsOutOfTen = Math.round(2 * place.rating);
            const fullStars = Math.floor(starsOutOfTen / 2);
            const halfStars = fullStars !== starsOutOfTen / 2 ? 1 : 0;
            const emptyStars = 5 - fullStars - halfStars;

            // Express stars as arrays to make iterating in Handlebars easy.
            place.fullStarIcons = initArray(fullStars);
            place.halfStarIcons = initArray(halfStars);
            place.emptyStarIcons = initArray(emptyStars);
        }
        if (place.price_level) {
            place.dollarSigns = initArray(place.price_level);
        }
        if (place.website) {
            const url = new URL(place.website);
            place.websiteDomain = url.hostname;
        }

        context.place = place;
        renderDetails(context);
        }
    });
    }
    renderDetails(context);
    hideElement(locator.panelListEl);
    showElement(panelDetailsEl);
};
}


const CONFIGURATION = {"capabilities":{"input":true,"autocomplete":true,"directions":true,"distanceMatrix":true,"details":true},"locations":[{"title":"RADIAL LLANTAS Lázaro Cárdenas","address1":"Calz. Lázaro Cárdenas 2107","address2":"Las Torres, 44920 Guadalajara, Jal., México","coords":{"lat":20.654145529801664,"lng":-103.37499472023774},"placeId":"ChIJ3THjoguuKIQRqsHGxbPwvAA"},{"title":"RADIAL LLANTAS Echegaray","address1":"Av. Gustavo Baz Prada 232","address2":"Colón Echegaray, 53300 Naucalpan de Juárez, Méx., México","coords":{"lat":19.496363220462822,"lng":-99.22633600859834},"placeId":"ChIJ82HT_eYC0oURobEde9etoD8"},{"title":"RADIAL LLANTAS 8 de Julio","address1":"Morelos","address2":"Av 8 de Julio 1631, 8 de Julio, 44910 Guadalajara, Jal., México","coords":{"lat":20.64898581643781,"lng":-103.36026327976226},"placeId":"ChIJg4vEeoKxKIQRZJOOg4HxRCk"},{"title":"RADIAL LLANTAS Parque Lira","address1":"Av. Parque Lira 111","address2":"San Miguel Chapultepec I Secc, Miguel Hidalgo, 11850 Ciudad de México, CDMX, México","coords":{"lat":19.405954077156586,"lng":-99.1885262932541},"placeId":"ChIJMYlsE2D_0YURaeov1Td6Gow"},{"title":"RADIAL LLANTAS Cuajimalpa","address1":"Carr. México-Toluca 2699","address2":"Granjas Palo Alto, Cuajimalpa de Morelos, 05110 Ciudad de México, CDMX, México","coords":{"lat":19.380976884088653,"lng":-99.25536303558198},"placeId":"ChIJxXpR7x8B0oURMRUMJatoJxw"},{"title":"RADIAL LLANTAS Universidad","address1":"Av. Universidad 1387","address2":"Axotla, Álvaro Obregón, 01030 Ciudad de México, CDMX, México","coords":{"lat":19.356580063243477,"lng":-99.17360166441803},"placeId":"ChIJP_6yw3__0YURrp4p9qVFnJo"},{"title":"RADIAL LLANTAS Periférico Puebla","address1":"Periférico Ecológico 7km+510","address2":"Anillo Perif. Ecológico, Cuatro Caminos, 72000 Puebla, Pue., México","coords":{"lat":19.106332930251146,"lng":-98.28087673558198},"placeId":"ChIJfUW_ruHFz4UR7jclhLpadac"},{"title":"RADIAL LLANTAS Juan Pablo II","address1":"Cto Juan Pablo II 1136","address2":"Reforma Agua Azul, 72430 Puebla, Pue., México","coords":{"lat":19.027991649561624,"lng":-98.22134503558196},"placeId":"ChIJbQBO-o7Hz4URxuhUO6s3Wk8"},{"title":"RADIAL LLANTAS Periférico Sur","address1":"Periférico Sur Poniente","address2":"21A. Poniente Sur \u0026, Xamaipak, 29000 Tuxtla Gutiérrez, Chis., México","coords":{"lat":16.74995028939294,"lng":-93.13830046441802},"placeId":"ChIJ219s0wHZ7IUR9jt7tTGDYz4"},{"title":"RADIAL LLANTAS Matriz Palmas","address1":"Carrt. Panamericana Km. 1089","address2":"Las Palmas, 29000 Tuxtla Gutiérrez, Chis., México","coords":{"lat":16.74896272631542,"lng":-93.08987053558197},"placeId":"ChIJSzgjYXgn7YUR21qhu7TBV7k"},{"title":"RADIAL LLANTAS 5ta Norte","address1":"5ta Av. Norte Poniente #1160 entre 10° y","address2":"Av. 11A. Nte. Pte., Col. Centro, Colón, 29000 Tuxtla Gutiérrez, Chis., México","coords":{"lat":16.759855036897424,"lng":-93.12449263558197},"placeId":"ChIJP79SOu7Y7IUR97mcjcNR_Y4"},{"title":"RADIAL LLANTAS San Cristóbal","address1":"Carrt. Panamericana Km. 1169 #90 entre Av. De Los Eucaliptos","address2":"a un costado de agencia Nissan, Faisán y, Barrio de Fatima, 29269 San Cristóbal de las Casas, Chis., México","coords":{"lat":16.731815321629476,"lng":-92.65532613558196},"placeId":"ChIJ627rFgtF7YURlFTyTBwsMPk"},{"title":"RADIAL LLANTAS Villaflores","address1":"Calle 11a. Pte. 79","address2":"Centro, 30470 Villaflores, Chis., México","coords":{"lat":16.228104842458396,"lng":-93.27456436441803},"placeId":"ChIJt201Ql87k4URABi_pVhfxF4"},{"title":"RADIAL LLANTAS Guadalupe Tapachula","address1":"Calle Octava Ote. 6","address2":"Los Naranjos, Centro, 30700 Tapachula de Córdova y Ordoñez, Chis., México","coords":{"lat":14.900998016045419,"lng":-92.26490843558197},"placeId":"ChIJdZjaFyEPjoURz_q1AkMDjo8"},{"title":"RADIAL LLANTAS Guadalupe Tapachula","address1":"Calle Octava Ote. 6","address2":"Los Naranjos, Centro, 30700 Tapachula de Córdova y Ordoñez, Chis., México","coords":{"lat":14.901005468075814,"lng":-92.26491916441803},"placeId":"ChIJdZjaFyEPjoURz_q1AkMDjo8"},{"title":"RADIAL LLANTAS Matriz Villahermosa","address1":"Villahermosa - Cardenas Km. 5+500","address2":"Ranchería Anacleto Canabal 4ª sección, 86103 Villahermosa, Tab., México","coords":{"lat":17.987351102230644,"lng":-92.99024993558197},"placeId":"ChIJ6-GmA1vW7YURbLYiaOyTmoc"},{"title":"RADIAL LLANTAS Cárdenas 1","address1":"Carr. Cto. del Golfo LB","address2":"Centro, 86500 Heroica Cárdenas, Tab., México","coords":{"lat":17.99880903967906,"lng":-93.37248266441804},"placeId":"ChIJAbPSj_gh7IURoWZH0zll7YM"},{"title":"RADIAL LLANTAS Cárdenas 2","address1":"Aurelio Sosa Torres 162-A","address2":"Pueblo Nuevo, 86560 Heroica Cárdenas, Tab., México","coords":{"lat":17.994870670301893,"lng":-93.37794973558195},"placeId":"ChIJRUuCSvUg7IURb4X1jMbp0gk"},{"title":"RADIAL LLANTAS Fuente Maya","address1":"Av Paseo de la Sierra 700-1","address2":"Primero de Mayo, 86190 Villahermosa, Tab., México","coords":{"lat":17.97598320734748,"lng":-92.92990844722137},"placeId":"ChIJ69Hl-tLZ7YURYVn6l_sZDI8"},{"title":"RADIAL LLANTAS Niños Héroes","address1":"Av. Adolfo Ruiz Cortines esquina","address2":"Cuadrante II, niños heroes, 86280 Villahermosa, Tab., México","coords":{"lat":17.99144322658421,"lng":-92.945253864418},"placeId":"ChIJWypxnI_X7YURDrl2yW9KLkQ"},{"title":"RADIAL LLANTAS Ruiz Cortínes","address1":"Boulevard Adolfo Ruiz Cortines 905","address2":"Centro Delegacion Seis, 86280 Villahermosa, Tab., México","coords":{"lat":17.999556060357538,"lng":-92.92222916441804},"placeId":"ChIJuVWSfj7Y7YURIV4--aY6nYw"},{"title":"RADIAL LLANTAS 27 Febrero","address1":"Av. 27 de Febrero 1818","address2":"Atasta de Serra, 86190 Villahermosa, Tab., México","coords":{"lat":17.9822377961226,"lng":-92.937593364418},"placeId":"ChIJ0apjASzY7YURJuymON4LDJg"},{"title":"RADIAL LLANTAS Costa Verde","address1":"Calz Juan Pablo II #1111","address2":"Costa Verde, 94294 Veracruz, Ver., México","coords":{"lat":19.160360083952092,"lng":-96.114998264418},"placeId":"ChIJkxUNEytBw4URqpQSbPChjqU"},{"title":"RADIAL LLANTAS Cuauhtémoc","address1":"Pinos","address2":"91870 Veracruz, Ver., México","coords":{"lat":19.208231464440793,"lng":-96.16222936441801},"placeId":"ChIJhbxVhhpFw4URV6JRIt-XsY4"},{"title":"RADIAL LLANTAS Xalapa","address1":"Calle Lázaro Cárdenas 975","address2":"La Lagunilla, 91119 Xalapa-Enríquez, Ver., México","coords":{"lat":19.562154793631684,"lng":-96.92674716441802},"placeId":"ChIJ768eV5Iv24URnCE8tOIkJtw"},{"title":"Prol Madero 3901","address1":"Prol Madero 3901","address2":"Fierro, 64590 Monterrey, N.L., México","coords":{"lat":25.684419859590548,"lng":-100.27424793558197},"placeId":"ChIJ_cDD0luVYoYRGlDuu9wee8E"},{"title":"RADIAL LLANTAS Aguascalientes El Dorado","address1":"República Mexicana 319","address2":"El Dorado, 20235 Aguascalientes, Ags., México","coords":{"lat":21.86426495926662,"lng":-102.30454436441804},"placeId":"ChIJm4GHjivsKYQR2r1fYa_kq1I"},{"title":"RADIAL LLANTAS Aldama","address1":"Blvd. Hermanos Aldama 1201 B","address2":"San Miguel, 37390 León, Gto., México","coords":{"lat":21.10010347018595,"lng":-101.67924190674593},"placeId":"ChIJN1rLGLa_K4QRk2CNVZBd1HM"},{"title":"Radial LLANTAS Juárez","address1":"Juárez 1601","address2":"Los Fresnos, 37390 León, Gto., México","coords":{"lat":21.10691134512737,"lng":-101.68971249325409},"placeId":"ChIJ0arZeVa_K4QR016iy_Spn1A"},{"title":"RADIAL LLANTAS Arbide","address1":"Calle Nicaragua 102","address2":"Arbide, 37360 León, Gto., México","coords":{"lat":21.12479291374036,"lng":-101.69382116441803},"placeId":"ChIJmWf7M6-_K4QRY1MXcEsOljo"},{"title":"RADIAL LLANTAS Parque Hidalgo","address1":"37320","address2":"Blvd. Adolfo López Mateos 1304, Obregon, 37320 León, Gto., México","coords":{"lat":21.133479014538224,"lng":-101.68737006441803},"placeId":"ChIJUQTAute_K4QR0OjqsQFvmY4"},{"title":"RADIAL LLANTAS Country","address1":"Av. Cvln. Jorge Álvarez del Castillo 1057","address2":"Country Club, 44610 Guadalajara, Jal., México","coords":{"lat":20.697081636419142,"lng":-103.37216223558198},"placeId":"ChIJ7TYY7DquKIQRRjE2e7_tauc"},{"title":"RADIAL LLANTAS Revolución","address1":"Calz. Revolución 1221","address2":"La Perla, 44420 Guadalajara, Jal., México","coords":{"lat":20.66259901531513,"lng":-103.3283504932541},"placeId":"ChIJrZ-RlSayKIQRe0vmlqnEdWs"},{"title":"RADIAL LLANTAS Tolsá","address1":"Av Enrique Díaz de León Nte 240","address2":"Zona Centro, 44100 Guadalajara, Jal., México","coords":{"lat":20.679683666578235,"lng":-103.35905346441801},"placeId":"ChIJoSBCoWWvKIQRinH6v1yt1nE"},{"title":"RADIAL LLANTAS Libertad","address1":"Calle Federación 1766","address2":"Sector Libertad, 44380 Guadalajara, Jal., México","coords":{"lat":20.676372568404485,"lng":-103.31304636441803},"placeId":"ChIJg4vEeoKxKIQR7LHQsFciQvo"},{"title":"RADIAL LLANTAS Hermosillo","address1":"Blvd. Solidaridad 1198","address2":"Palo Verde, 83280 Hermosillo, Son., México","coords":{"lat":29.039316707570308,"lng":-110.96062996441803},"placeId":"ChIJd4Fb1hqEzoYRUKvGO5mctow"},{"title":"RADIAL LLANTAS Patria","address1":"Av. Patria 5117","address2":"Sta Catalina, 45054 Zapopan, Jal., México","coords":{"lat":20.651562060910578,"lng":-103.42278903558197},"placeId":"ChIJf0WliSOsKIQRKC1qt8aQ2zI"},{"title":"Radial Llantas Camionera","address1":"Tuberosa 539","address2":"San Carlos, 44470 Guadalajara, Jal., México","coords":{"lat":20.65685857629087,"lng":-103.33852316441804},"placeId":"ChIJ-RO0shmyKIQRwgRSkVBAZgg"},{"title":"RADIAL LLANTAS Eulogio Parra","address1":"Calle Gral. Eulogio Parra #3049","address2":"Prados Providencia, 44670 Guadalajara, Jal., México","coords":{"lat":20.687394350718225,"lng":-103.39195236441805},"placeId":"ChIJ0ahFnUiuKIQReZydQdOMfcA"},{"title":"RADIAL LLANTAS Providencia","address1":"Av Pablo Neruda 2898","address2":"Providencia 4a. Secc, 44630 Guadalajara, Jal., México","coords":{"lat":20.698191663605364,"lng":-103.38525266441805},"placeId":"ChIJY-KOg0iuKIQRcUu40SpwIwI"},{"title":"RADIAL LLANTAS Gallo","address1":"Calz. Jesús González Gallo #1335","address2":"Sector Reforma, 44430 Guadalajara, Jal., México","coords":{"lat":20.64897074566214,"lng":-103.3348030932541},"placeId":"ChIJ5_6RCD6yKIQR4R_yXu93BmU"},{"title":"RADIAL LLANTAS 5 de Mayo","address1":"Av. 5 de Mayo sur #689","address2":"Centro, 59600 Zamora de Hidalgo, Mich., México","coords":{"lat":19.97543455739623,"lng":-102.28478676441803},"placeId":"ChIJSUFJNcKILoQR61nwTOF9H9U"},{"title":"RADIAL LLANTAS Madero","address1":"Francisco I. Madero Sur 576","address2":"La Medallita, Centro, 59600 Zamora de Hidalgo, Mich., México","coords":{"lat":19.980560237766593,"lng":-102.28978613558198},"placeId":"ChIJ_UkKOMWILoQR2LzFcVxqahs"},{"title":"RADIAL LLANTAS Culiacán","address1":"Blvd. Francisco Labastida Ochoa 1309","address2":"La Lima, 80040 Culiacán Rosales, Sin., México","coords":{"lat":24.825200160718296,"lng":-107.37716253558197},"placeId":"ChIJo7zMIQ3avIYR0JbJ6wPKqzs"},{"title":"RADIAL LLANTAS Manzanillo","address1":"Blvd. Costero Miguel de la Madrid Vejar # 924 Col. Las Brisas","address2":" Playa Azul las Brisas, 28200 Manzanillo, Colima, México","coords":{"lat":19.085301563522588,"lng":-104.30944976441805},"placeId":"ChIJw9UlnsLVJIQRtoMUfyJPwpo"},{"title":"RADIAL LLANTAS Colima","address1":"Av Rey Coliman #302","address2":"Centro, 28000 Colima, Col., México","coords":{"lat":19.234813203206336,"lng":-103.72434276441803},"placeId":"ChIJqSC5xgBQJYQR_F6O2lp0Ysk"},{"title":"RADIAL LLANTAS Copérnico","address1":"Av. Nicolás Copérnico No. 3600","address2":"Arboledas, 45070 Zapopan, Jal., México","coords":{"lat":20.62878610354625,"lng":-103.41908493558196},"placeId":"ChIJ049sskWsKIQRMlSSEK0JD84"},{"title":"RADIAL LLANTAS Eduwiges","address1":"Av. Circunvalación Agustín Yáñez 2439","address2":"Arcos, 44150 Guadalajara, Jal., México","coords":{"lat":20.66736889596172,"lng":-103.37827446441803},"placeId":"ChIJQ0TqoguuKIQROjXrZv2LZjY"},{"title":"RADIAL LLANTAS Tránsito","address1":"Av. Cvln. División del Nte. 873","address2":"Jardines Alcalde, 44298 Guadalajara, Jal., México","coords":{"lat":20.703853967311257,"lng":-103.34496529325409},"placeId":"ChIJ-078Tc6xKIQR1Zhh4Fmgkvk"},{"title":"RADIAL LLANTAS Guadalupe","address1":"Av Guadalupe #3206","address2":"Chapalita, 44500 Guadalajara, Jal., México","coords":{"lat":20.666749611023516,"lng":-103.39524496441803},"placeId":"ChIJOWBmmXmuKIQRhlx-nv0wWwE"},{"title":"RADIAL LLANTAS Vallarta Centro","address1":"Blvrd Francisco Medina Ascencio 2164","address2":"Díaz Ordaz, 48310 Puerto Vallarta, Jal., México","coords":{"lat":20.639105669417834,"lng":-105.23308966441805},"placeId":"ChIJ4a5e7nBFIYQR1t-V1ievJw0"},{"title":"RADIAL LLANTAS Vallarta Las Juntas","address1":"Blvrd Francisco Medina Ascencio 14-16","address2":"Las Moras, 48291 Las Jarretaderas, Jal., México","coords":{"lat":20.688388337862627,"lng":-105.25098666441804},"placeId":"ChIJ7QvInRhFIYQRcVtOe4GaOUc"},{"title":"RADIAL LLANTAS Tepic","address1":"PRISILIANO SANCHEZ #50 SUR","address2":"Mariano Abasolo Ote., Versalles Sur, 63000 Tepic, Nay., México","coords":{"lat":21.505858199595128,"lng":-104.88915649325409},"placeId":"ChIJl8gSBAM3J4QRl9dCGhA7hCI"},{"title":"RADIAL LLANTAS Tepic","address1":"PRISILIANO SANCHEZ #50 SUR","address2":"Mariano Abasolo Ote., Versalles Sur, 63000 Tepic, Nay., México","coords":{"lat":21.505855392187005,"lng":-104.88914576441803},"placeId":"ChIJl8gSBAM3J4QRl9dCGhA7hCI"},{"title":"RADIAL LLANTAS Huatulco","address1":"Plumbago 1616","address2":"H, 70987 Crucecita, Oax., México","coords":{"lat":15.76956531020186,"lng":-96.14229433558198},"placeId":"ChIJ-Ub1nEghv4UR6ncf9RHRNk8"},{"title":"RADIAL LLANTAS Playa 1","address1":"Carr. Cancún - Tulum S/N","address2":"Luis Donaldo Colosio, 77710 Playa del Carmen, Q.R., México","coords":{"lat":20.649780588979716,"lng":-87.06714123558196},"placeId":"ChIJj5idJtJCTo8Rwa-fjODgcWU"},{"title":"Radial Llantas Playa 2","address1":"77712","address2":"50 Avenida Norte 825, Ejidal, 77712 Playa del Carmen, Q.R., México","coords":{"lat":20.620269286203328,"lng":-87.09189763558197},"placeId":"ChIJ-wUDcBJDTo8R-I2iftHEPr4"},{"title":"RADIAL LLANTAS Portillo","address1":"Av. López Portillo #890","address2":"Unidad Morelos, 77515 Cancún, Q.R., México","coords":{"lat":21.1581565788364,"lng":-86.85868866441803},"placeId":"ChIJsVIn6YArTI8RXiqWGkikB1s"},{"title":"RADIAL LLANTAS Aeropuerto Cancún","address1":"Boulevard Luis Donaldo Colosio Sm 308 Mz 2 Lt 45 Alfredo V. Bomfil","address2":"77560 Cancún, Q.R., México","coords":{"lat":21.08156028836443,"lng":-86.84422213558197},"placeId":"ChIJez6IYWsqTI8RlxVWrGHQQeA"},{"title":"RADIAL LLANTAS Uxmal","address1":"Av Uxmal Núm.41","address2":"63, 77515 Cancún, Q.R., México","coords":{"lat":21.168431345725566,"lng":-86.83484293558197},"placeId":"ChIJ6bYX-Q4sTI8RB6QVOVxtmLE"},{"title":"RADIAL LLANTAS Campeche","address1":"Av Cto Baluartes 5","address2":"Barrio de San Román, 24040 Campeche, Camp., México","coords":{"lat":19.840423107105757,"lng":-90.53894263558196},"placeId":"ChIJnz9NP-4z-IURZaxZXEe4gCU"},{"title":"RADIAL LLANTAS Alemán","address1":"Calle 35 236","address2":"Miguel Alemán, 97148 Mérida, Yuc., México","coords":{"lat":20.985618751869723,"lng":-89.59465653558196},"placeId":"ChIJ2cQhfyVxVo8R4zkhG_HEl1A"},{"title":"RADIAL LLANTAS Industrial","address1":"Av. Policarpo de Echanove # 316","address2":"Cd Industrial, 97288 Mérida, Yuc., México","coords":{"lat":20.93397313661881,"lng":-89.67574067116395},"placeId":"ChIJFZt5Ie5yVo8RpUd6nBkwQdY"},{"title":"RADIAL LLANTAS Mejorada","address1":"Calle 50 X 53 Y 55 Local 488","address2":"Centro, 97000 Mérida, Yuc., México","coords":{"lat":20.970133164135156,"lng":-89.61550238161466},"placeId":"ChIJOwrCm2hxVo8RHOI_69aMY1s"},{"title":"RADIAL LLANTAS México Oriente","address1":"Calle 17 201","address2":"México Oriente, 97137 Mérida, Yuc., México","coords":{"lat":21.00325408299638,"lng":-89.60421713558196},"placeId":"ChIJNdDhPsp2Vo8RtV59slxR0wc"},{"title":"RADIAL LLANTAS 60 Norte","address1":"Calle 10 # 225-C por 21 y 23 Col","address2":"Chuburna de Hidalgo, Felipe Carrillo Puerto, 97200 Mérida, Yuc., México","coords":{"lat":21.014378927481268,"lng":-89.62635806441801},"placeId":"ChIJ7xvpQqh2Vo8RArc5TfLg9AY"},{"title":"RADIAL LLANTAS 65 Oriente","address1":"Calle 65 # 685 por 16 y 18 Fracc","address2":"Emilio Portes Gil, 97167 Mérida, Yuc., México","coords":{"lat":20.959941084373327,"lng":-89.58737696441803},"placeId":"ChIJ3zLVYv1wVo8RAcSXlRxM9rw"},{"title":"RADIAL LLANTAS Monte Albán","address1":"Calle 49 # 485-C por 22 Col","address2":"San Antonio Cucul, 97116 Mérida, Yuc., México","coords":{"lat":21.021191677767277,"lng":-89.60029426441803},"placeId":"ChIJTRZYcsJ2Vo8RyMCv5T8VKUE"},{"title":"RADIAL LLANTAS Paseo Montejo","address1":"Prol. Paseo Montejo 492 - B","address2":"Centro, 97000 Mérida, Yuc., México","coords":{"lat":20.991433747478716,"lng":-89.61625736441803},"placeId":"ChIJpb3R8FFxVo8RzrjWnoMM4f8"},{"title":"RADIAL LLANTAS Itzaes","address1":"CALLE 90 NUMERO 535A POR 86B","address2":"Av. Itzáes, Centro, 97000 Mérida, Yuc., México","coords":{"lat":20.955227711777646,"lng":-89.64310543558196},"placeId":"ChIJLXzUEcpzVo8Rmi2DqgPVs7I"},{"title":"RADIAL LLANTAS Matriz Mérida","address1":"Calle 27D No. 521 x 56 y 58","address2":"Zona Industrial, Amapola, 97219 Mérida, Yuc., México","coords":{"lat":21.008047844374133,"lng":-89.66483906441802},"placeId":"ChIJGeg4yod0Vo8RNg4HVJzSf_c"},{"title":"RADIAL LLANTAS Francisco de Montejo","address1":"Calle 51 268","address2":"Francisco de Montejo, 97203 Mérida, Yuc., México","coords":{"lat":21.030771610623905,"lng":-89.64449296441803},"placeId":"ChIJTwl2eEd0Vo8R7yJoON6Ny7I"},{"title":"Radial LLANTAS Garza Sada","address1":"Av. Eugenio Garza Sada #4446","address2":"Las Brisas, 64780 Monterrey, N.L., México","coords":{"lat":25.62324458202783,"lng":-100.27469486441802},"placeId":"ChIJDx4kml6_YoYR9uSPZqZL3y4"},{"title":"RADIAL LLANTAS Bugambilias","address1":"Av. Adolfo López Mateos Sur 2039","address2":"El Mante, 45235 Zapopan, Jal., México","coords":{"lat":20.61181006698814,"lng":-103.42857376441803},"placeId":"ChIJOUnta3CtKIQRWliz9XhOq68"},{"title":"RADIAL LLANTAS Calzada del Hueso","address1":"Calz. del Hueso #956 El Mirador","address2":"Coapa, Cuauhtémoc, Coyoacán, 04950 Ciudad de México, CDMX, México","coords":{"lat":19.29969000250731,"lng":-99.10873579325408},"placeId":"ChIJf_MyTYcBzoUR2Xe8WsKedzE"}],"mapOptions":{},"mapsApiKey":"AIzaSyBoX4bPODWZYqw29QTyQulDu8q0m4_oQqs"};
    function initMap() {
    new LocatorPlus(CONFIGURATION);
    }
    