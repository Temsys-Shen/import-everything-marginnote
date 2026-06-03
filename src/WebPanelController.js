var __MN_WEB_API_MNImportEverythingAddon = (function () {
  const PANEL_ON_KEY = "mn_web_template_mnimporteverythingaddon_panel_on";

  const BRIDGE_SCHEME = "mnaddon";
  const BRIDGE_HOST = "bridge";

  const PANEL_ANIMATION_DURATION = 0.24;
  const PANEL_ANIMATION_KEY = "mn-import-everything-panel-slide";

  function evaluateScript(webView, script) {
    webView.evaluateJavaScript(script, null);
  }

  function encodeBridgeJSON(value) {
    return JSON.stringify(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  function decodeBridgeMessage(requestURL) {
    const absolute = String(requestURL.absoluteString());
    if (!absolute.startsWith(`${BRIDGE_SCHEME}://${BRIDGE_HOST}`)) {
      throw new Error(`Unexpected bridge URL: ${absolute}`);
    }

    const marker = "payload=";
    const index = absolute.indexOf(marker);
    if (index < 0) {
      throw new Error(`Missing payload in bridge URL: ${absolute}`);
    }

    const rawPayload = absolute.slice(index + marker.length);
    const decodedPayload = decodeURIComponent(rawPayload);
    const message = JSON.parse(decodedPayload);

    if (!message || typeof message !== "object") {
      throw new Error("Bridge payload must be an object");
    }
    if (!message.command || typeof message.command !== "string") {
      throw new Error("Bridge payload missing command");
    }
    if (!message.requestId || typeof message.requestId !== "string") {
      throw new Error("Bridge payload missing requestId");
    }

    return message;
  }

  function resolveWebEntryURL(mainPath) {
    const devServerURL = __MNGetWebDevServerURL_MNImportEverythingAddon();
    if (devServerURL) {
      console.log(`[WebAddon] load dev server: ${devServerURL}`);
      return {
        url: NSURL.URLWithString(devServerURL),
        kind: "remote",
      };
    }

    const localEntryPath = `${mainPath}/web-dist/index.html`;
    const fileManager = NSFileManager.defaultManager();
    if (!fileManager.fileExistsAtPath(localEntryPath)) {
      throw new Error(
        `Web build output not found: ${localEntryPath}. Run \"pnpm build\" or \"npm run build\" first.`,
      );
    }

    console.log(`[WebAddon] load local build: ${localEntryPath}`);
    return {
      url: NSURL.fileURLWithPath(localEntryPath),
      kind: "local",
    };
  }

  function sendBridgeResponse(webView, requestId, result, error) {
    const response = {
      requestId,
      payload: result === undefined ? null : result,
      error: error === undefined ? null : error,
    };

    const script = `window.__MNBridgeReceive_MNImportEverythingAddon('${encodeBridgeJSON(response)}')`;
    evaluateScript(webView, script);
  }

  function normalizeBridgeError(error, command) {
    return {
      message: error && error.message ? error.message : String(error),
      command: command || "unknown",
    };
  }

  function isPromiseLike(value) {
    return !!value && typeof value.then === "function";
  }

  function refreshAddonCommands(controller) {
    NSTimer.scheduledTimerWithTimeInterval(0, false, function () {
      const targetWindow = controller.addon ? controller.addon.window : controller.addonWindow;
      if (!targetWindow) return;
      Application.sharedInstance().studyController(targetWindow).refreshAddonCommands();
    });
  }

  function finishCloseWindow(controller) {
    controller.view.hidden = true;
    controller.view.layer.removeAnimationForKey(PANEL_ANIMATION_KEY);
    if (controller.view.superview) {
      controller.view.removeFromSuperview();
    }
    NSUserDefaults.standardUserDefaults().setObjectForKey(false, PANEL_ON_KEY);
    refreshAddonCommands(controller);
  }

  function getPanelVisibleCenter(controller) {
    const frame = controller.view.frame;
    return {
      x: frame.x + frame.width / 2,
      y: frame.y + frame.height / 2,
    };
  }

  function getPanelHiddenCenter(controller) {
    const frame = controller.view.frame;
    return {
      x: frame.x + frame.width / 2,
      y: frame.y + frame.height + frame.height / 2,
    };
  }

  function createSlideAnimation(fromCenter, toCenter) {
    const animation = CABasicAnimation.animationWithKeyPath("position.y");
    animation.fromValue = fromCenter.y;
    animation.toValue = toCenter.y;
    animation.duration = PANEL_ANIMATION_DURATION;
    animation.timingFunction = CAMediaTimingFunction.functionWithName("easeInEaseOut");
    return animation;
  }

  function animatePanelToCenter(controller, fromCenter, toCenter, completion) {
    controller.view.layer.removeAnimationForKey(PANEL_ANIMATION_KEY);
    controller.view.center = toCenter;
    controller.view.layer.addAnimationForKey(createSlideAnimation(fromCenter, toCenter), PANEL_ANIMATION_KEY);

    if (completion) {
      NSTimer.scheduledTimerWithTimeInterval(PANEL_ANIMATION_DURATION, false, completion);
    }
  }

  function animatePanelIn(controller) {
    const visibleCenter = getPanelVisibleCenter(controller);
    const hiddenCenter = getPanelHiddenCenter(controller);
    controller.view.center = hiddenCenter;
    controller.view.hidden = false;
    animatePanelToCenter(controller, hiddenCenter, visibleCenter, null);
  }

  function performCloseWindow(controller) {
    if (!controller.view || !controller.view.superview) {
      finishCloseWindow(controller);
      return;
    }

    const visibleCenter = getPanelVisibleCenter(controller);
    const hiddenCenter = getPanelHiddenCenter(controller);
    animatePanelToCenter(controller, visibleCenter, hiddenCenter, function () {
      finishCloseWindow(controller);
    });
  }

  function getStudyRootBounds(controller) {
    const targetWindow = controller.addon ? controller.addon.window : controller.addonWindow;
    const studyController = Application.sharedInstance().studyController(targetWindow);
    if (!studyController || !studyController.view) {
      throw new Error("studyController not found");
    }
    return studyController.view.bounds;
  }

  function applyFullscreenFrame(controller) {
    const bounds = getStudyRootBounds(controller);
    controller.view.frame = {
      x: bounds.x || 0,
      y: bounds.y || 0,
      width: bounds.width,
      height: bounds.height,
    };
    controller.view.setNeedsLayout();
  }

  function refreshWebPanelLayout(controller) {
    const frame = controller.view.bounds;
    controller.containerView.frame = {
      x: 0,
      y: 0,
      width: frame.width,
      height: frame.height,
    };
    controller.webView.frame = {
      x: 0,
      y: 0,
      width: frame.width,
      height: frame.height,
    };
  }

  function setupWebPanelUI(controller) {
    controller.navigationItem.title = "Import Everything";
    controller.view.backgroundColor = UIColor.whiteColor();

    const bounds = controller.view.bounds;
    const initWidth = bounds.width > 0 ? bounds.width : 400;
    const initHeight = bounds.height > 0 ? bounds.height : 480;

    controller.containerView = new UIView({ x: 0, y: 0, width: initWidth, height: initHeight });
    controller.containerView.backgroundColor = UIColor.whiteColor();
    controller.containerView.layer.cornerRadius = 0;
    controller.containerView.layer.masksToBounds = false;
    controller.containerView.autoresizingMask = (1 << 1 | 1 << 4);
    controller.view.addSubview(controller.containerView);

    controller.webView = new UIWebView({
      x: 0,
      y: 0,
      width: initWidth,
      height: initHeight,
    });
    controller.webView.backgroundColor = UIColor.whiteColor();
    controller.webView.scalesPageToFit = true;
    controller.webView.autoresizingMask = (1 << 1 | 1 << 4);
    controller.webView.delegate = controller;
    controller.containerView.addSubview(controller.webView);
  }

  function dispatchBridgeCommand(controller, message) {
    const commandTable = __MN_WEB_BRIDGE_COMMANDS_MNImportEverythingAddon.commands;
    const handler = commandTable[message.command];

    if (typeof handler !== "function") {
      throw new Error(`Unknown bridge command: ${message.command}`);
    }

    const context = {
      controller,
      addon: controller.addon,
      closePanel: performCloseWindow,
    };

    return handler(context, message.payload);
  }

  function loadInitialWebPage(controller) {
    const entry = resolveWebEntryURL(controller.mainPath);
    const request = NSURLRequest.requestWithURL(entry.url);
    controller.webView.loadRequest(request);
  }

  const panelControllerClass = JSB.defineClass("MNWebPanelController_MNImportEverythingAddon : UIViewController <UIWebViewDelegate>", {
    viewDidLoad: function () {
      setupWebPanelUI(self);
      loadInitialWebPage(self);
    },

    viewDidLayoutSubviews: function () {
      refreshWebPanelLayout(self);
    },

    closeWindow: function () {
      performCloseWindow(self);
    },

    viewWillAppear: function () {
      self.webView.delegate = self;
      evaluateScript(self.webView, "typeof window.__onPanelShow==='function'&&window.__onPanelShow();");
    },

    viewWillDisappear: function () {
      self.webView.stopLoading();
      self.webView.delegate = null;
      UIApplication.sharedApplication().networkActivityIndicatorVisible = false;
    },

    webViewDidStartLoad: function () {
      UIApplication.sharedApplication().networkActivityIndicatorVisible = true;
    },

    webViewDidFinishLoad: function () {
      UIApplication.sharedApplication().networkActivityIndicatorVisible = false;
    },

    webViewDidFailLoadWithError: function (webView, error) {
      UIApplication.sharedApplication().networkActivityIndicatorVisible = false;
      const message = String(error && error.localizedDescription ? error.localizedDescription : error);
      const errHTML =
        "<html><body style=\"margin:20px;font-family:-apple-system;color:#666;\"><h3>Load failed</h3><p>" +
        message.replace(/</g, "&lt;") +
        "</p></body></html>";
      self.webView.loadHTMLStringBaseURL(errHTML, null);
    },

    webViewShouldStartLoadWithRequestNavigationType: function (webView, request, navigationType) {
      try {
        const url = request.URL();
        const scheme = String(url.scheme || "").toLowerCase();

        if (scheme !== BRIDGE_SCHEME) {
          return true;
        }

        const message = decodeBridgeMessage(url);
        const result = dispatchBridgeCommand(self, message);

        if (isPromiseLike(result)) {
          result.then(function (payload) {
            sendBridgeResponse(webView, message.requestId, payload, null);
          }).catch(function (error) {
            const bridgeError = normalizeBridgeError(error, message.command);
            sendBridgeResponse(webView, message.requestId, null, bridgeError);
            console.log(`[WebAddon] bridge error: ${bridgeError.message}`);
          });
          return false;
        }

        sendBridgeResponse(webView, message.requestId, result, null);
        return false;
      } catch (error) {
        const bridgeError = normalizeBridgeError(error, "unknown");
        sendBridgeResponse(webView, "unknown", null, bridgeError);
        console.log(`[WebAddon] bridge error: ${bridgeError.message}`);
        return false;
      }
    },
  });

  function createController(mainPath, addon) {
    const controller = panelControllerClass.new();
    controller.mainPath = mainPath;
    controller.addon = addon;
    controller.addonWindow = addon.window;
    return controller;
  }

  function showPanel(controller) {
    const targetWindow = controller.addon ? controller.addon.window : controller.addonWindow;
    const studyController = Application.sharedInstance().studyController(targetWindow);
    if (!studyController || !studyController.view) {
      throw new Error("studyController not found");
    }

    if (!controller.view.superview) {
      studyController.view.addSubview(controller.view);
    }

    applyFullscreenFrame(controller);
    animatePanelIn(controller);
    NSUserDefaults.standardUserDefaults().setObjectForKey(true, PANEL_ON_KEY);
    refreshAddonCommands(controller);
  }

  function hidePanel(controller) {
    performCloseWindow(controller);
  }

  function shouldRestorePanel() {
    return NSUserDefaults.standardUserDefaults().objectForKey(PANEL_ON_KEY) === true;
  }

  function ensureLayout(controller) {
    if (!controller.view) {
      return;
    }
    applyFullscreenFrame(controller);
  }

  return {
    createController,
    showPanel,
    hidePanel,
    shouldRestorePanel,
    ensureLayout,
  };
})();
