JSB.require("BinaryTransferStore");
JSB.require("ExportConfigStore");
JSB.require("MindmapImportTaskStore");
JSB.require("WebDevServerConfig");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("MNImportEverythingAddon");

JSB.newAddon = function (mainPath) {
  return createMNImportEverythingAddon(mainPath);
};
