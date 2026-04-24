function createMNImportEverythingAddon(mainPath) {
  return JSB.defineClass("MNImportEverythingAddon : JSExtension", {
    sceneWillConnect: function () {
      self.mainPath = mainPath;
      self.webController = __MN_WEB_API_MNImportEverythingAddon.createController(mainPath, self);

      self.layoutViewController = function () {
        __MN_WEB_API_MNImportEverythingAddon.ensureLayout(self.webController);
      };

      console.log("[Import Everything] initialized");
    },

    sceneDidDisconnect: function () {
      if (self.webController && self.webController.view && self.webController.view.superview) {
        self.webController.view.removeFromSuperview();
      }
      self.webController = null;
      console.log("[Import Everything] disconnected");
    },

    notebookWillOpen: function () {
      if (!self.webController) {
        throw new Error("webController not initialized");
      }

      self.webController.addon = self;
      self.webController.addonWindow = self.window;

      if (__MN_WEB_API_MNImportEverythingAddon.shouldRestorePanel()) {
        __MN_WEB_API_MNImportEverythingAddon.showPanel(self.webController);
        self.layoutViewController();
      }
    },

    controllerWillLayoutSubviews: function (controller) {
      if (controller === Application.sharedInstance().studyController(self.window)) {
        self.layoutViewController();
      }
    },

    queryAddonCommandStatus: function () {
      const checked =
        self.webController &&
        self.webController.view &&
        self.webController.view.window
          ? true
          : false;

      return {
        image: "icon.png",
        object: self,
        selector: "toggleWebPanel:",
        checked,
      };
    },

    toggleWebPanel: function () {
      if (!self.webController) {
        throw new Error("webController not initialized");
      }

      if (self.webController.view && self.webController.view.window) {
        __MN_WEB_API_MNImportEverythingAddon.hidePanel(self.webController);
      } else {
        __MN_WEB_API_MNImportEverythingAddon.showPanel(self.webController);
        self.layoutViewController();
      }

      Application.sharedInstance().studyController(self.window).refreshAddonCommands();
    },
  });
}
