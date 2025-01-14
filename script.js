proj4.defs([
    ["EPSG:4326", "+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees"],
    ["EPSG:31370", "+proj=lcc +lat_0=90 +lon_0=4.36748666666667 +lat_1=51.1666672333333 +lat_2=49.8333339 +x_0=150000.013 +y_0=5400088.438 +ellps=intl +towgs84=-106.8686,52.2978,-103.7239,0.3366,-0.457,1.8422,-1.2747 +units=m +no_defs +type=crs"]
]);

function findIntersection(p1, dx1, dy1, p2, dx2, dy2) {
    let x1 = p1[0], y1 = p1[1];
    let x2 = p2[0], y2 = p2[1];
    let det = dx1 * dy2 - dx2 * dy1;
    if (det === 0) {
        return null;
    }
    let t = ((x2 - x1) * dy2 - (y2 - y1) * dx2) / det;
    let intersectionX = x1 + t * dx1;
    let intersectionY = y1 + t * dy1;
    return [intersectionX, intersectionY];
}

function calculateBottom(vertices) {
    // get degrees from input field called angle
    const degrees = document.getElementById("angle").value;
    const slope = degrees * (Math.PI / 180);
    const depth = document.getElementById("depth").value / 100;
    const distance = depth / Math.tan(slope);
    let lines = [];
    let bottom = [];
    for (let i = 0; i < vertices.length - 1; i++) {
        let p1 = vertices[i];
        let p2 = i < vertices.length - 1 ? vertices[i + 1] : vertices[0];
        let midpoint = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
        let dx = p2[0] - p1[0];
        let dy = p2[1] - p1[1];
        let length = Math.sqrt(dx * dx + dy * dy);
        let perpX = -dy / length;
        let perpY = dx / length;
        let scaledPerpX = perpX * distance;
        let scaledPerpY = perpY * distance;
        let perpendicularPoint = [midpoint[0] + scaledPerpX, midpoint[1] + scaledPerpY];
        lines.push([perpendicularPoint, dx, dy]);
    }
    for (let i = 0; i < lines.length; i++) {
        let line1 = lines[i];
        let line2 = i < lines.length - 1 ? lines[i + 1] : lines[0];
        let intersection = findIntersection(line1[0], line1[1], line1[2], line2[0], line2[1], line2[2]);
        bottom.push(intersection);
    }
    bottom.unshift(bottom[bottom.length - 1]);
    return bottom;
}

function transformCoordinates(coords, from, to) {
    return coords.map(latlng => proj4(from, to, latlng));
}

function coordsToGeoJSON(coords) {
    return {
        type: "Feature",
        geometry: {
            type: "Polygon",
            coordinates: [coords]
        }
    };
}

mapboxgl.accessToken = "pk.eyJ1IjoiaW9kZXBvIiwiYSI6ImNrd2txMXRyaTFpNjkybm1sZWxwemtrbWsifQ.KtiKSQsLSwvnDtfg9T9qdA";
const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v9",
    projection: "globe",
    zoom: 19,
    center: [3.186437, 51.183496]
});

map.addControl(new mapboxgl.NavigationControl());

const draw = new MapboxDraw({
    displayControlsDefault: false,
    displayControlsDefault: false,
    modes: {
        ...MapboxDraw.modes,
        simple_select: { ...MapboxDraw.modes.simple_select, dragMove() {} },
        direct_select: { ...MapboxDraw.modes.direct_select, dragFeature() {} },
    },
    styles: [
        {
            "id": "custom-polygon-fill",
            "type": "fill",
            "filter": ["all", ["==", "$type", "Polygon"]],
            "paint": {
                "fill-color": "#00ff00",
                "fill-opacity": 0.1,
            }
        },
        {
            "id": "custom-polygon-outline",
            "type": "line",
            "filter": ["all", ["==", "$type", "Polygon"]],
            "layout": {},
            "paint": {
                "line-color": "#000000",
                "line-width": 1
            }
        }
    ],
    controls: {
        polygon: true,
        trash: false
    }
});
map.addControl(draw);

map.on("draw.create", handleDraw);
map.on("draw.delete", handleDraw);
map.on("draw.update", handleDraw);

document.getElementById("clear").addEventListener("click", function () {
    draw.deleteAll();
    const layers = map.getStyle().layers;
    layers.forEach(layer => {
        if (layer.id.startsWith("bottom")) {
            map.removeLayer(layer.id);
            map.removeSource(layer.id);
        }
    });
    const tableBody = document.getElementById("table-body");
    tableBody.innerHTML = "";
});

map.on("load", function () {
    map.addLayer({
        "id": "wms-layer",
        "type": "raster",
        "source": {
            "type": "raster",
            "tiles": [
                "https://geo.api.vlaanderen.be/Adpf/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image%2Fpng&TRANSPARENT=true&layers=GrAdpf2024&STYLES=default&CRS=EPSG:3857&WIDTH=1278&HEIGHT=678&BBOX={bbox-epsg-3857}",
            ],
            "tileSize": 256
        },
        "paint": {
            "raster-opacity": 0.7
        }
    });
});

function handleDraw(e) {

    geojsonRewind(e.features[0], true);

    const vertices = e.features[0].geometry.coordinates[0];
    const top = transformCoordinates(vertices, "EPSG:4326", "EPSG:31370");
    const topGeoJSON = coordsToGeoJSON(vertices);
    const bottom = calculateBottom(top);
    const bottomGeoJSON = coordsToGeoJSON(transformCoordinates(bottom, "EPSG:31370", "EPSG:4326"));

    let totalLength = 0;
    let lengths = [];
    for (let i = 0; i < top.length - 1; i++) {
        const p1 = top[i];
        const p2 = top[i + 1];
        let l = Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2));
        lengths.push(l);
        totalLength += l;
    }

    const degrees = document.getElementById("angle").value;
    const depth = document.getElementById("depth").value / 100;
    const topArea = turf.area(topGeoJSON);
    const bottomArea = turf.area(bottomGeoJSON);
    const volume = (depth / 3) * (topArea + bottomArea + Math.sqrt(topArea * bottomArea));

    const requiredSurface = document.getElementById("surface").value * 0.08;
    const requiredVolume = document.getElementById("surface").value * 33 / 1000;

    const tableBody = document.getElementById("table-body");
    const row = document.createElement("tr");

    const depthCell = document.createElement("td");
    depthCell.innerText = depth * 100 + " cm";
    row.appendChild(depthCell);

    const angleCell = document.createElement("td");
    angleCell.innerText = degrees + "°";
    row.appendChild(angleCell);

    const requiredSurfaceCell = document.createElement("td");
    requiredSurfaceCell.innerText = requiredSurface.toFixed(1) + " m²";
    row.appendChild(requiredSurfaceCell);

    const topAreaCell = document.createElement("td");
    topAreaCell.innerText = topArea.toFixed(1) + " m²";
    topAreaCell.classList.add(topArea < requiredSurface ? "insufficient" : "sufficient");
    row.appendChild(topAreaCell);

    const requiredVolumeCell = document.createElement("td");
    requiredVolumeCell.innerText = requiredVolume.toFixed(1) + " m³";
    row.appendChild(requiredVolumeCell);

    const volumeCell = document.createElement("td");
    volumeCell.innerText = volume.toFixed(1) + " m³";
    volumeCell.classList.add(volume < requiredVolume ? "insufficient" : "sufficient");
    row.appendChild(volumeCell);

    const lengthCell = document.createElement("td");
    lengthCell.innerText = lengths.map(l => l.toFixed(1)).join(" m + ") + " = " + totalLength.toFixed(1) + " m";
    row.appendChild(lengthCell);

    tableBody.appendChild(row);

    const layerid = Math.floor(Math.random() * 1001).toString();

    map.addSource("bottom" + layerid, {
        type: "geojson",
        data: bottomGeoJSON
    });
    map.addLayer({
        id: "bottom" + layerid,
        type: "line",
        source: "bottom" + layerid,
        paint: {
            "line-color": "#000000",
            "line-width": 1,
            "line-dasharray": [2, 2]
        }
    });

}
