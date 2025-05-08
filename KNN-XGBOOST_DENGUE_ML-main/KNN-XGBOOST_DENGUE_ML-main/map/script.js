// Initialize map centered in Iligan City
var map = L.map('map').setView([8.2280, 124.2452], 15);

// Base maps
var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
});

var esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/' +
    'World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 50,
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics'
});

// Default layer
osm.addTo(map);

// Layer control
var baseLayers = {
    "OpenStreetMap": osm,
    "Esri Satellite": esriSat
};
L.control.layers(baseLayers).addTo(map);


// 👇 Add this block here
map.on("baselayerchange", function (e) {
    if (e.name === "Esri Satellite") {
        // Change zoom level to 13 when switching to Esri Satellite
        map.setZoom(13); // Set zoom level to 13 for Esri
        // Remove circles and add heatmap (or other actions)
        if (heatLayer) heatLayer.addTo(map);
        mapCircles.forEach(circle => map.removeLayer(circle));
    } else if (e.name === "OpenStreetMap") {
        // Change zoom level to 15 when switching to OSM
        map.setZoom(15); // Set zoom level to 15 for OSM
        // Remove heatmap and add circles
        if (heatLayer) map.removeLayer(heatLayer);
        mapCircles.forEach(circle => map.addLayer(circle));
    }
});

let mapCircles = [];
let heatLayer = null;
let dengueChart = null; // Chart instance

function updateSidebar(highRiskAreas, topBarangays) {
    const highRiskCount = highRiskAreas.length;
    document.getElementById('high-risk-count').textContent = highRiskCount;

    const affectedPeople = highRiskAreas.reduce((sum, area) => sum + area.predictedCases_Hybrid, 0);
    document.getElementById('affected-people-count').textContent = affectedPeople;

    let html = "<h2>Top 10 Barangays by Predicted Cases</h2>";
    html += "<table style='width:100%; border-collapse: collapse;'>";
    html += "<thead><tr><th>Barangay</th><th>No. of Cases</th></tr></thead><tbody>";

    topBarangays.forEach(bgy => {
        html += `<tr><td><b>${bgy.name}</b></td><td>${bgy.totalCases}</td></tr>`;
    });

    html += "</tbody></table>";
    document.getElementById('top-barangays').innerHTML = html;
}





function updateModalData(filtered, year, month) {
    if (filtered.length === 0) {
        console.log("No data available for the selected year and month.");
        return;
    }

    // Calculate totals and averages
    const totalPredicted = filtered.reduce((sum, entry) => sum + Number(entry.predictedCases_Hybrid), 0);
    const totalActual = filtered.reduce((sum, entry) => sum + Number(entry.actualCases || 0), 0);

    // Round to nearest whole number
    const averageCases = Math.round(totalPredicted / filtered.length);

    console.log('Average (rounded):', averageCases);
    console.log('Type of averageCases:', typeof averageCases);




    // Categorize areas by risk level
    const highRiskAreas = filtered.filter(entry => entry.riskLevel.toLowerCase() === "high");
    const mediumRiskAreas = filtered.filter(entry => entry.riskLevel === "Medium");
    const lowRiskAreas = filtered.filter(entry => entry.riskLevel === "Low");

    // Populate modal data
    document.getElementById('total-predicted').textContent = totalPredicted;
    document.getElementById('total-actual').textContent = totalActual;
    document.getElementById('average-cases').textContent = averageCases.toFixed(2);
    document.getElementById('modal-high-risk-count').textContent = highRiskAreas.length;
    document.getElementById('medium-risk-count').textContent = mediumRiskAreas.length;
    document.getElementById('low-risk-count').textContent = lowRiskAreas.length;

    // Render the graph for top 10 barangays (already shown in the graph update)
    const topBarangays = filtered.slice(0, 10).map(bgy => ({
        name: bgy.name,
        predictedCases: bgy.predictedCases_Hybrid,
        actualCases: bgy.actualCases || 0
    }));

    const barangayNames = topBarangays.map(bgy => bgy.name);
    const predictedCases = topBarangays.map(bgy => bgy.predictedCases);
    const actualCases = topBarangays.map(bgy => bgy.actualCases);

    showGraph(actualCases, predictedCases, barangayNames);
}





function updateMap(year, month, risk) {
    if (heatLayer) map.removeLayer(heatLayer);
    mapCircles.forEach(c => map.removeLayer(c));
    mapCircles = [];

    Promise.all([
        fetch("Hybrid_2020_to_2023_only.json").then(res => res.json()),
        fetch("barangays-municity-794-iligancity.0.001.json").then(res => res.json())
        // Optional: fetch("real_cases_2011_to_2023.json").then(res => res.json()) // if you have real data
    ])
    .then(([predictionData, geoData]) => {
        const filtered = predictionData.filter(entry =>
            entry.year === year &&
            entry.month === month &&
            entry.predictedCases_Hybrid > 0 &&
            (risk === "All" || entry.riskLevel === risk)
        );

        updateModalData(filtered, year, month);

        const barangayTotals = {};
        filtered.forEach(bgy => {
            barangayTotals[bgy.name] = (barangayTotals[bgy.name] || 0) + bgy.predictedCases_Hybrid;
        });

        const topBarangays = Object.entries(barangayTotals)
            .map(([name, totalCases]) => ({ name, totalCases }))
            .sort((a, b) => b.totalCases - a.totalCases)
            .slice(0, 10);

        const highRiskAreas = filtered.filter(bgy => bgy.riskLevel === "High");
        updateSidebar(highRiskAreas, topBarangays);

        const nameToCentroid = {};
        geoData.features.forEach(feature => {
            const name = feature.properties.NAME_3.trim().toUpperCase();
            const coords = feature.geometry.coordinates;
            let centroid = null;

            if (feature.geometry.type === "Polygon") {
                centroid = getCentroid(coords[0]);
            } else if (feature.geometry.type === "MultiPolygon") {
                centroid = getCentroid(coords[0][0]);
            }

            if (centroid) nameToCentroid[name] = centroid;
        });

        const heatPoints = [];
        filtered.forEach(bgy => {
            const centroid = nameToCentroid[bgy.name.trim().toUpperCase()];
            if (centroid) {
                heatPoints.push([centroid[1], centroid[0], bgy.predictedCases_Hybrid]);
            }
        });

        filtered.forEach(bgy => {
            const centroid = nameToCentroid[bgy.name.trim().toUpperCase()];
            if (centroid) {
                let riskClass = "low";
                if (bgy.riskLevel === "High") riskClass = "high";
                else if (bgy.riskLevel === "Medium") riskClass = "medium";
        
                const pulseIcon = L.divIcon({
                    className: '', // Empty to avoid Leaflet default styling
                    html: `<div class="pulse-circle ${riskClass}"></div>`,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });
        
                const marker = L.marker([centroid[1], centroid[0]], {
                    icon: pulseIcon
                }).bindPopup(
                    `<b>${bgy.name}</b><br>` +
                    `Risk Level: ${bgy.riskLevel}<br>` +
                    `Predicted Cases: ${bgy.predictedCases_Hybrid}<br>` +
                    `Month: ${bgy.month}, Year: ${bgy.year}`
                );
        
                mapCircles.push(marker);
            }
        });
        

        heatLayer = L.heatLayer(heatPoints, {
            radius: 40,
            blur: 60,
            maxZoom: 10,
            gradient: {
                0.4: 'green',
                0.5: 'yellow',
                0.7: 'red'
            }
        });

        if (map.hasLayer(esriSat)) {
            heatLayer.addTo(map);
        } else {
            mapCircles.forEach(marker => map.addLayer(marker));
        }

        // 🔵 Render the Chart
        const barangays = topBarangays.map(b => b.name);
        const predicted = topBarangays.map(b => b.totalCases);
        const real = topBarangays.map(bgy => {
            const actual = filtered.find(entry => entry.name.toUpperCase() === bgy.name.toUpperCase() && entry.year === year && entry.month === month);
            return actual ? actual.actualCases : 0;   // Default to 0 if no actual cases found
        });


        showGraph(real, predicted, barangays);
    })
    .catch(err => console.error("Error loading data:", err));
}

function getCentroid(ring) {
    // Return null if the ring is undefined or empty
    if (!ring || ring.length === 0) return null;

    let x = 0, y = 0, len = ring.length;
    for (let i = 0; i < len; i++) {
        x += ring[i][0];   // Longitude
        y += ring[i][1];   // Latitude
    }

    return [x / len, y / len];   // [Longitude, Latitude]
}


function showGraph(realCases, predictedCases, labels) {
    const ctx = document.getElementById('dengueChart').getContext('2d');

    if (dengueChart) dengueChart.destroy();

    dengueChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels ,// Use real barangay names passed to `showGraph`
            datasets: [
                {
                    label: 'Actual Cases',
                    data: realCases,
                    borderColor: 'rgba(54, 162, 235, 1)',   // 🔵 Blue line
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    fill: false,
                    tension: 0.3
                },
                {
                    label: 'Predicted Cases',
                    data: predictedCases,
                    borderColor: 'rgba(255, 99, 132, 1)',   // 🔴 Red line
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: false,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });

}

document.addEventListener("DOMContentLoaded", function () {
    const yearEl = document.getElementById("year");
    const monthEl = document.getElementById("month");
    const riskEl = document.getElementById("risk");

    // Load stored values from localStorage and set them *before* the initial map load
    const storedYear = localStorage.getItem("selectedYear");
    const storedMonth = localStorage.getItem("selectedMonth");
    const storedRisk = localStorage.getItem("selectedRisk");

    if (storedYear) {
        yearEl.value = storedYear;
    }
    if (storedMonth) {
        monthEl.value = storedMonth;
    }
    if (storedRisk) {
        riskEl.value = storedRisk;
    }

    // Ensure the modal is hidden on page load
    const modal = document.getElementById("info-modal");
    modal.style.display = "none"; // Ensure modal is hidden initially

    // Add an event listener to the button to toggle modal visibility
    document.getElementById("toggle-graph").addEventListener("click", function () {
        if (modal.style.display === "none" || modal.style.display === "") {
            modal.style.display = "flex"; // Show modal
        } else {
            modal.style.display = "none"; // Hide modal
        }
    });

    // Function to update filters and store selected values
    function updateFilters() {
        const year = parseInt(yearEl.value);
        const month = parseInt(monthEl.value);
        const risk = riskEl.value;

        // Store selected year, month, and risk in localStorage
        localStorage.setItem("selectedYear", year);
        localStorage.setItem("selectedMonth", month);
        localStorage.setItem("selectedRisk", risk);

        if (!isNaN(year) && !isNaN(month)) {
            updateMap(year, month, risk); // Call your updateMap function
        }
    }

    // Event listeners for dropdown changes
    yearEl.addEventListener("change", updateFilters);
    monthEl.addEventListener("change", updateFilters);
    riskEl.addEventListener("change", updateFilters);

    // Initial map load with values from localStorage if available, otherwise defaults
    const initialYear = storedYear ? parseInt(storedYear) : 2020;
    const initialMonth = storedMonth ? parseInt(storedMonth) : 1;
    const initialRisk = storedRisk ? storedRisk : "All";
    updateMap(initialYear, initialMonth, initialRisk);
});