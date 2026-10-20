// ArcGIS JS API 4.x version of the template-details app
require([
    "esri/config",
    "esri/request",
    "esri/core/promiseUtils",
    "esri/core/Collection",
    "esri/core/Handles"
], function (esriConfig, esriRequest, promiseUtils, Collection, Handles) {
    console.log("HELLO", esriConfig.apiKey)
    // Full template list
    var templates = [
        { id: "instant/3dviewer", label: "3D Viewer" },
        { id: "instant/atlas", label: "Atlas" },
        { id: "instant/attachmentviewer", label: "Attachment Viewer" },
        { id: "instant/basic", label: "Basic" },
        {
            id: "instant/dataexplorer",
            label: "Data Explorer"
        },
        { id: "instant/filtergallery", label: "Category Gallery" },
        { id: "instant/gallery", label: "Gallery" },
        { id: "instant/imageryviewer", label: "Imagery Viewer" },
        {
            id: "instant/indicators",
            label: "Indicators"
        },
        { id: "instant/insets", label: "Insets" },
        { id: "instant/interactivelegend", label: "Interactive Legend" },
        { id: "instant/manager", label: "Manager" },
        { id: "instant/nearby", label: "Nearby" },
        { id: "instant/observer", label: "Observer" },
        { id: "instant/portfolio", label: "Portfolio" },
        { id: "instant/notification", label: "Public Notification" },
        { id: "instant/reporter", label: "Reporter" },
        { id: "instant/sidebar", label: "Sidebar" },
        { id: "instant/slider", label: "Slider" },
        { id: "instant/streamflowviewer", label: "Streamflow Viewer" },
        { id: "instant/webeditor", label: "Web Editor" },
        { id: "instant/lookup", label: "Zone Lookup" }
    ];

    var templateSelect = document.getElementById("templateTypes");
    templates.forEach(function (t) {
        var opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.label;
        templateSelect.appendChild(opt);
    });

    // Prepopulate date inputs
    function pad(n) { return n < 10 ? '0' + n : n; }
    function toDateTimeLocal(date) {
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    }
    var now = new Date();
    var dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    document.getElementById("endDate").value = toDateTimeLocal(now);
    document.getElementById("startDate").value = toDateTimeLocal(dayAgo);

    // Query logic
    var featureServiceUrl = "https://services.arcgis.com/V6ZHFr6zdgNZuVG0/arcgis/rest/services/TemplateAppMining/FeatureServer/0/query";

    function getEpoch(dateStr) {
        // dateStr: 'YYYY-MM-DDTHH:mm'
        return new Date(dateStr).getTime();
    }

    function queryTemplates(type, startEpoch, endEpoch) {
        var where = `CreatedTime BETWEEN '${startEpoch}' AND '${endEpoch}' AND Type = '${type}'`;
        return esriRequest(featureServiceUrl, {
            query: {
                where: where,
                outFields: '*',
                f: 'json',
                returnGeometry: false
            },
            responseType: "json"
        }).then(function (response) {
            return response.data.features || [];
        });
    }

    function updateTable(features) {
        var tableDiv = document.getElementById("templateDetailTable");
        if (!features.length) {
            tableDiv.innerHTML = "<div>No results found.</div>";
            return;
        }
        var html = '<table class="table table-bordered table-striped"><thead><tr>' +
            '<th>Application Url</th><th>Configured</th><th>Account</th><th>Locale</th></tr></thead><tbody>';
        features.forEach(function (f) {
            var a = f.attributes;
            html += '<tr>' +
                `<td><a href="${a.Url}" target="_blank">${a.Url ? a.Url.split("/")[2] : ""}</a></td>` +
                `<td>${formatConfigured(a.Configured)}</td>` +
                `<td>${a.Account || ""}</td>` +
                `<td>${a.TemplateOwner || ""}</td>` +
                '</tr>';
        });
        html += '</tbody></table>';
        tableDiv.innerHTML = html;
    }

    function formatConfigured(value) {
        if (typeof value === 'string') value = value.toLowerCase().trim();
        switch (value) {
            case true:
            case "true":
            case "yes":
            case "1":
                return "Yes";
            case false:
            case "false":
            case "no":
            case "0":
            case null:
            case undefined:
                return "No";
            default:
                return value ? "Yes" : "No";
        }
    }

    function showCountAndTable(type, typeLabel, start, end, features) {
        var countDiv = document.getElementById("templateCountInfo");
        var startFmt = new Date(start).toLocaleString();
        var endFmt = new Date(end).toLocaleString();
        countDiv.innerHTML = `${features.length} ${typeLabel} apps created between ${startFmt} and ${endFmt}`;
        updateTable(features);
    }

    // Date buttons
    var dateButtons = document.querySelectorAll(".btn-date");
    dateButtons.forEach(function (btn) {
        btn.addEventListener("click", function () {
            var duration = btn.getAttribute("data-duration");
            var now = new Date();
            var start = new Date();
            switch (duration) {
                case "hour": start.setHours(now.getHours() - 1); break;
                case "day": start.setDate(now.getDate() - 1); break;
                case "week": start.setDate(now.getDate() - 7); break;
                case "month": start.setMonth(now.getMonth() - 1); break;
                case "year": start.setFullYear(now.getFullYear() - 1); break;
            }
            var type = templateSelect.value;
            var typeLabel = templateSelect.options[templateSelect.selectedIndex].textContent;
            var startEpoch = start.getTime();
            var endEpoch = now.getTime();
            document.getElementById("templateCountInfo").textContent = "Loading...";
            queryTemplates(type, startEpoch, endEpoch).then(function (features) {
                showCountAndTable(type, typeLabel, start, now, features);
            });
        });
    });

    // Custom date range
    document.getElementById("goDates").addEventListener("click", function () {
        var startStr = document.getElementById("startDate").value;
        var endStr = document.getElementById("endDate").value;
        var startEpoch = getEpoch(startStr);
        var endEpoch = getEpoch(endStr);
        var type = templateSelect.value;
        var typeLabel = templateSelect.options[templateSelect.selectedIndex].textContent;
        document.getElementById("templateCountInfo").textContent = "Loading...";
        queryTemplates(type, startEpoch, endEpoch).then(function (features) {
            showCountAndTable(type, typeLabel, startEpoch, endEpoch, features);
        });
    });
});
