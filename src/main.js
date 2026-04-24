JSB.require("WebDevServerConfig");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("MNImportEverythingAddon");

JSB.newAddon = function (mainPath) {
  return createMNImportEverythingAddon(mainPath);
};
