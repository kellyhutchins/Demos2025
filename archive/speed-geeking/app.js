
const arcgisMap = document.querySelector("arcgis-map");
const features = document.querySelector("arcgis-features");

arcgisMap.addEventListener("arcgisViewClick", (event) => {
  const { mapPoint } = event.detail;
  features.open({
    location: mapPoint,
    fetchFeatures: true
  })
})

const toggleModeEl = document.getElementById("toggle-mode");
const darkModeCss = document.getElementById("jsapi-mode-dark");
const lightModeCss = document.getElementById("jsapi-mode-light");
let mode = "light";
toggleModeEl.addEventListener("click", () => {

  mode = mode === "dark" ? "light" : "dark";
  const isDarkMode = mode === "dark";
  darkModeCss.disabled = !isDarkMode;
  lightModeCss.disabled = isDarkMode;
  toggleModeEl.icon = isDarkMode ? "moon" : "brightness";
  document.body.classList.toggle("calcite-mode-dark", isDarkMode);

  // ensure maps sdk components update to the correct mode
  document.querySelectorAll(`.calcite-mode-${isDarkMode ? "light" : "dark"}`).forEach(node => {
    node.classList.replace(`calcite-mode-${isDarkMode ? "light" : "dark"}`, `calcite-mode-${mode}`);
  });

});


