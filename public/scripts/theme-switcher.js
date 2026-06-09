(function () {
  const storageKey = "workhq-harness-theme";
  const themes = [
    { value: "workhq-dark", label: "WorkHQ Dark" },
    { value: "ssc-blue-prism", label: "SS&C Blue Prism" },
    { value: "riyad-bank", label: "Riyad Bank" }
  ];
  const themeLogos = {
    "riyad-bank": "rb_logo.svg"
  };

  function getStoredTheme() {
    try {
      return localStorage.getItem(storageKey) || themes[0].value;
    } catch (err) {
      return themes[0].value;
    }
  }

  function setStoredTheme(theme) {
    try {
      localStorage.setItem(storageKey, theme);
    } catch (err) {
      // Local storage can be unavailable in restricted browser modes.
    }
  }

  function applyTheme(theme) {
    const selectedTheme = themes.some(item => item.value === theme) ? theme : themes[0].value;
    document.documentElement.dataset.theme = selectedTheme;
    updateLogos(selectedTheme);
    setStoredTheme(selectedTheme);
  }

  function getAssetPrefix(src) {
    const assetIndex = src.lastIndexOf("assets/");
    return assetIndex === -1 ? "assets/" : src.slice(0, assetIndex + "assets/".length);
  }

  function updateLogos(theme) {
    document.querySelectorAll("[data-theme-logo]").forEach(logo => {
      const defaultLogo = logo.dataset.defaultLogo || logo.getAttribute("src");
      logo.dataset.defaultLogo = defaultLogo;

      if (themeLogos[theme]) {
        logo.src = `${getAssetPrefix(defaultLogo)}${themeLogos[theme]}`;
        return;
      }

      logo.src = defaultLogo;
    });
  }

  function createSwitcher() {
    if (document.querySelector("[data-theme-switcher]")) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "theme-switcher";
    wrapper.dataset.themeSwitcher = "";

    const label = document.createElement("label");
    label.htmlFor = "theme-select";
    label.textContent = "Theme";

    const select = document.createElement("select");
    select.id = "theme-select";
    select.setAttribute("aria-label", "Select theme");

    themes.forEach(theme => {
      const option = document.createElement("option");
      option.value = theme.value;
      option.textContent = theme.label;
      select.append(option);
    });

    select.value = document.documentElement.dataset.theme || themes[0].value;
    select.addEventListener("change", () => applyTheme(select.value));

    wrapper.append(label, select);
    document.body.append(wrapper);
  }

  applyTheme(getStoredTheme());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      updateLogos(getStoredTheme());
      createSwitcher();
    });
  } else {
    updateLogos(getStoredTheme());
    createSwitcher();
  }
})();
