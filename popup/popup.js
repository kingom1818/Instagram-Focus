(function () {
  'use strict';

  const DEFAULTS = { extensionEnabled: true, hideSearchBar: false };

  const extToggle = document.getElementById('toggle-extension');
  const searchToggle = document.getElementById('toggle-search');
  const searchRow = document.getElementById('row-search');
  const status = document.getElementById('status');

  function setSwitch(button, isOn) {
    button.setAttribute('aria-checked', String(isOn));
    button.classList.toggle('switch--on', isOn);
  }

  function render(state) {
    setSwitch(extToggle, state.extensionEnabled);
    setSwitch(searchToggle, state.hideSearchBar);

    // Master toggle takes priority — grey out the row, but keep it
    // interactive since the setting still saves while paused.
    searchRow.classList.toggle('toggle-row--inactive', !state.extensionEnabled);

    status.textContent = state.extensionEnabled ? 'Focus mode active' : 'Extension paused';
    status.classList.toggle('popup__status--paused', !state.extensionEnabled);
  }

  function load() {
    chrome.storage.sync.get(DEFAULTS, render);
  }

  extToggle.addEventListener('click', () => {
    chrome.storage.sync.get(DEFAULTS, (state) => {
      chrome.storage.sync.set({ extensionEnabled: !state.extensionEnabled }, load);
    });
  });

  searchToggle.addEventListener('click', () => {
    chrome.storage.sync.get(DEFAULTS, (state) => {
      chrome.storage.sync.set({ hideSearchBar: !state.hideSearchBar }, load);
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') load();
  });

  load();
})();
