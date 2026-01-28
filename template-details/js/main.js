require([
  "esri/moment",
  "dojo/parser",
  "dojo/ready",
  "dojo/on",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-construct",
  "dojo/query",
  "dojo/_base/array",
  "dojo/Deferred",
  "dojo/promise/all",
  "esri/layers/FeatureLayer",
  "esri/config",
  "dgrid/OnDemandGrid",
  "dojo/store/Memory",
  "esri/tasks/query",
  "esri/urlUtils",
  "esri/lang",
  "esri/IdentityManager",
  "dojo/domReady!"
], function (
  moment,
  parser,
  ready,
  on, dom,
  domClass,
  domConstruct,
  query,
  array,
  Deferred,
  all,
  FeatureLayer,
  esriConfig,
  Grid,
  Memory,
  QueryTask,
  urlUtils,
  EsriLang
) {
  ready(function () {
    esriConfig.apiKey = "AAPTxy8BH1VEsoebNVZXo8HurPtbrhTUJ1U4IFjTvcTHxviXfWYGo1M2-sC-woTWkyTC4WJTOJjY2chJ2hnoLSGkQR9kBv7AFGvsnTOQsuvMTw630eDi0NaiFOzAFvOIciO7_mFQCMYrZZl4KCsyELagvU0FzYgU57OY3yVvCFB3jYfwacV1sKaBFLYKmLHUYTIMaXKFn6qlK7lcu4nQtqN454feGvu-pM3tbwshqVUPTOE.AT1_hi1kLPfU"
    // Prepopulate the template dropdown list

    var templates = [
      {
        id: "instant/3dviewer",
        label: "3D Viewer"
      }, {
        id: "instant/atlas",
        label: "Atlas"
      }, {
        id: "instant/attachmentviewer",
        label: "Attachment Viewer"
      },
      {
        id: "instant/basic",
        label: "Basic"
      },
      {
        id: "instant/charts",
        label: "Chart Viewer"
      },
      {
        id: "instant/compare",
        label: "Compare"
      },
      {
        id: "instant/countdown",
        label: "Countdown"
      },
      {
        id: "instant/filtergallery",
        label: "Category Gallery"
      },
      {
        id: "instant/exhibit",
        label: "Exhibit"
      },
      {
        id: "instant/gallery",
        label: "Gallery"
      }, {
        id: "instant/imageryviewer",
        label: "Imagery Viewer"
      },
      {
        id: "instant/insets",
        label: "Insets"
      },
      {
        id: "instant/interactivelegend",
        label: "Interactive Legend"
      },
      {
        id: "instant/manager",
        label: "Manager"
      },
      {
        id: "instant/nearby",
        label: "Nearby"
      },
      {
        id: "instant/observer",
        label: "Observer"
      },
      {
        id: "instant/portfolio",
        label: "Portfolio"
      },
      {
        id: "instant/notification",
        label: "Public Notification"
      },
      {
        id: "instant/reporter",
        label: "Reporter"
      },
      {
        id: "instant/sidebar",
        label: "Sidebar"
      },
      {
        id: "instant/slider",
        label: "Slider"
      },
      {
        id: "instant/streamflowviewer",
        label: "Streamflow Viewer"
      },
      {
        id: "instant/webeditor",
        label: "Web Editor"
      }, {
        id: "instant/lookup",
        label: "Zone Lookup"
      }
    ];
    array.forEach(templates, function (template) {
      domConstruct.create("option", {
        value: template.id,
        innerHTML: template.label
      }, "templateTypes");
    });
    // Prepopulate the date inputs with the current date and yesterdays
    var today = moment();
    var dayAgo = moment().subtract(1, "days");
    dom.byId("endDate").value = today.format("YYYY-MM-DD[T]HH:mm");
    dom.byId("startDate").value = dayAgo.format("YYYY-MM-DD[T]HH:mm");

    query(".btn-date").on("click", getPreDefinedDate);

    // Hook up the Go button event handler
    on(dom.byId("goDates"), "click", getCustomDate);

    // Hide the loading icon
    domClass.add(dom.byId("loader"), "hide");


    esriConfig.defaults.io.corsEnabledServers.push("servicesbeta.esri.com");
    var grid = null;

    // Contains web map details
    var templateData = new FeatureLayer("https://services.arcgis.com/V6ZHFr6zdgNZuVG0/arcgis/rest/services/TemplateAppMining/FeatureServer/0", {
      mode: FeatureLayer.MODE_ONDEMAND,
      outFields: ["*"]
    });

    templateData.on("load", function () {
      console.log("Template Data Loaded");
    });

    function getCustomDate(e) {
      var startDate = moment(dom.byId("startDate").value);
      var endDate = moment(dom.byId("endDate").value);
      getDataByDates(startDate, endDate);

    }

    function getPreDefinedDate(e) {
      var now = moment();
      var start = moment().subtract(1, e.target.dataset.duration);
      getDataByDates(start, now);
    }

    function clearValues() {
      if (grid) {
        grid.set("store", new Memory({
          data: []
        }));
      }
      domClass.remove("loader", "hide");
      domConstruct.empty("templateCountInfo");
    }

    function getDataByDates(start, end) {
      clearValues();
      var select = dom.byId("templateTypes");
      var type = select.value;
      var typeLabel = select.options[select.selectedIndex].innerHTML;
      var dateString = "CreatedTime BETWEEN '" + start.format("x") + "' AND '" + end.format("x") + "'";
      var totalQuery = new QueryTask();
      totalQuery.where = dateString + " and Type = '" + type + "'";

      templateData.queryFeatures(totalQuery, function (info) {
        dom.byId("templateCountInfo").innerHTML = info.features.length + " " + typeLabel + " apps created between " + start.format("M/D/YYYY h:mm A") + " and " + end.format("M/D/YYYY h:mm A");
        if (info.features.length > 0) {
          updateGrid(info.features);
        } else {
          domClass.add("loader", "hide");
        }
      });
    }

    function updateGrid(results) {
      var data = [];
      if (!grid) {
        grid = new Grid({
          bufferRows: Infinity,
          columns: {
            Url: {
              label: "Application Url",
              formatter: formatUrl
            },
            Configured: {
              label: "Configured",
              formatter: formatConfigured
            },
            Account: "Account",
            TemplateOwner: "Locale"
          }
        }, "templateDetailTable");
        grid.set("sort", "Type");
      }
      array.forEach(results, function (r) {
        data.push(r.attributes);
      });
      var memoryStore = new Memory({
        data: data
      });
      grid.set("store", memoryStore);

      domClass.add("loader", "hide");
    }

    function formatConfigured(value) {
      switch (value.toLowerCase().trim()) {
        case "true":
        case "yes":
        case "1":
          return true;
        case "false":
        case "no":
        case "0":
        case null:
          return false;
        default:
          return Boolean(value);
      }
    }

    function formatUrl(value) {
      var urlParts = value.split("/");
      var name = null;
      if (urlParts && urlParts.length > 3) {
        name = urlParts[2];
      } else {
        name = value;
      }
      value = "<a target='_blank' href='" + value + "'>" + name + "</a>";
      return value;
    }

  });
});
