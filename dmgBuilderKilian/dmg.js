"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DmgTarget = void 0;

function _builderUtil() {
  const data = require("builder-util");

  _builderUtil = function () {
    return data;
  };

  return data;
}

function _fs() {
  const data = require("builder-util/out/fs");

  _fs = function () {
    return data;
  };

  return data;
}

function _dmgLicense() {
  const data = require("./dmgLicense");

  _dmgLicense = function () {
    return data;
  };

  return data;
}

function _dmgUtil() {
  const data = require("./dmgUtil");

  _dmgUtil = function () {
    return data;
  };

  return data;
}

function _fsExtraP() {
  const data = require("fs-extra-p");

  _fsExtraP = function () {
    return data;
  };

  return data;
}

var path = _interopRequireWildcard(require("path"));

function _sanitizeFilename() {
  const data = _interopRequireDefault(require("sanitize-filename"));

  _sanitizeFilename = function () {
    return data;
  };

  return data;
}

function _macCodeSign() {
  const data = require("app-builder-lib/out/codeSign/macCodeSign");

  _macCodeSign = function () {
    return data;
  };

  return data;
}

function _appBuilderLib() {
  const data = require("app-builder-lib");

  _appBuilderLib = function () {
    return data;
  };

  return data;
}

function _differentialUpdateInfoBuilder() {
  const data = require("app-builder-lib/out/targets/differentialUpdateInfoBuilder");

  _differentialUpdateInfoBuilder = function () {
    return data;
  };

  return data;
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

class DmgTarget extends _appBuilderLib().Target {
  constructor(packager, outDir) {
    super("dmg");
    this.packager = packager;
    this.outDir = outDir;
    this.options = this.packager.config.dmg || Object.create(null);
  }

  async build(appPath, arch) {
    const packager = this.packager; // tslint:disable-next-line:no-invalid-template-strings

    const artifactName = packager.expandArtifactNamePattern(packager.config.dmg, "dmg", null, "${productName}-" + (packager.platformSpecificBuildOptions.bundleShortVersion || "${version}") + ".${ext}");
    const artifactPath = path.join(this.outDir, artifactName);
    await packager.info.callArtifactBuildStarted({
      targetPresentableName: "DMG",
      file: artifactPath,
      arch
    });
    const specification = await this.computeDmgOptions();
    const volumeName = (0, _sanitizeFilename().default)(this.computeVolumeName(specification.title));
    const tempDmg = await createStageDmg((await packager.getTempFile(".dmg")), appPath, volumeName); // https://github.com/electron-userland/electron-builder/issues/2115

    const backgroundFile = specification.background == null ? null : await (0, _dmgUtil().transformBackgroundFileIfNeed)(specification.background, packager.info.tempDirManager);
    const finalSize = await computeAssetSize(packager.info.cancellationToken, tempDmg, specification, backgroundFile);
    await (0, _builderUtil().exec)("hdiutil", ["resize", "-size", finalSize.toString(), tempDmg]);
    const volumePath = path.join("/Volumes", volumeName);

    if (await (0, _fs().exists)(volumePath)) {
      _builderUtil().log.debug({
        volumePath
      }, "unmounting previous disk image");

      await (0, _dmgUtil().detach)(volumePath);
    }

    if (!(await (0, _dmgUtil().attachAndExecute)(tempDmg, true, () => customizeDmg(volumePath, specification, packager, backgroundFile)))) {
      return;
    } // dmg file must not exist otherwise hdiutil failed (https://github.com/electron-userland/electron-builder/issues/1308#issuecomment-282847594), so, -ov must be specified


    const args = ["convert", tempDmg, "-ov", "-format", specification.format, "-o", artifactPath];

    if (specification.format === "UDZO") {
      args.push("-imagekey", `zlib-level=${process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || "9"}`);
    }

    await (0, _builderUtil().spawn)("hdiutil", addLogLevel(args));

    if (this.options.internetEnabled) {
      await (0, _builderUtil().exec)("hdiutil", addLogLevel(["internet-enable"]).concat(artifactPath));
    }

    const licenseData = await (0, _dmgLicense().addLicenseToDmg)(packager, artifactPath);

    if (packager.packagerOptions.effectiveOptionComputed != null) {
      await packager.packagerOptions.effectiveOptionComputed({
        licenseData
      });
    }

    if (this.options.sign) {
      await this.signDmg(artifactPath);
    }

    const safeArtifactName = packager.computeSafeArtifactName(artifactName, "dmg");
    const updateInfo = await (0, _differentialUpdateInfoBuilder().createBlockmap)(artifactPath, this, packager, safeArtifactName);
    await packager.info.callArtifactBuildCompleted({
      file: artifactPath,
      safeArtifactName,
      target: this,
      arch,
      packager,
      isWriteUpdateInfo: true,
      updateInfo
    });
  }

  async signDmg(artifactPath) {
    if (!(0, _macCodeSign().isSignAllowed)(false)) {
      return;
    }

    const packager = this.packager;
    const qualifier = packager.platformSpecificBuildOptions.identity; // explicitly disabled if set to null

    if (qualifier === null) {
      // macPackager already somehow handle this situation, so, here just return
      return;
    }

    const keychainName = (await packager.codeSigningInfo.value).keychainName;
    const certificateType = "Developer ID Application";
    let identity = await (0, _macCodeSign().findIdentity)(certificateType, qualifier, keychainName);

    if (identity == null) {
      identity = await (0, _macCodeSign().findIdentity)("Mac Developer", qualifier, keychainName);

      if (identity == null) {
        return;
      }
    }

    const args = ["--sign", identity.hash];

    if (keychainName != null) {
      args.push("--keychain", keychainName);
    }

    args.push(artifactPath);
    await (0, _builderUtil().exec)("codesign", args);
  }

  computeVolumeName(custom) {
    const appInfo = this.packager.appInfo;
    const shortVersion = this.packager.platformSpecificBuildOptions.bundleShortVersion || appInfo.version;

    if (custom == null) {
      return `${appInfo.productFilename} ${shortVersion}`;
    }

    return custom.replace(/\${shortVersion}/g, shortVersion).replace(/\${version}/g, appInfo.version).replace(/\${name}/g, appInfo.name).replace(/\${productName}/g, appInfo.productName);
  } // public to test


  async computeDmgOptions() {
    // appdmg
    const appdmgWindow = this.options.window || {};
    const oldPosition = appdmgWindow.position;
    const oldSize = appdmgWindow.size;
    const oldIconSize = this.options["icon-size"];
    const oldBackgroundColor = this.options["background-color"];

    if (oldPosition != null) {
      _builderUtil().log.warn({
        solution: "use dmg.window"
      }, "dmg.window.position is deprecated");
    }

    if (oldSize != null) {
      _builderUtil().log.warn({
        solution: "use dmg.window"
      }, "dmg.window.size is deprecated");
    }

    if (oldIconSize != null) {
      _builderUtil().log.warn({
        solution: "use dmg.iconSize"
      }, "dmg.icon-size is deprecated");
    }

    if (oldBackgroundColor != null) {
      _builderUtil().log.warn({
        solution: "use dmg.backgroundColor"
      }, "dmg.background-color is deprecated");
    }

    const packager = this.packager;
    const specification = (0, _builderUtil().deepAssign)({
      window: {
        x: 400,
        y: 100
      },
      iconSize: oldIconSize,
      backgroundColor: oldBackgroundColor,
      icon: "icon" in this.options ? undefined : await packager.getIconPath()
    }, this.options, oldPosition == null ? null : {
      window: {
        x: oldPosition.x,
        y: oldPosition.y
      }
    }, oldSize == null ? null : {
      window: {
        width: oldSize.width,
        height: oldSize.height
      }
    });

    if (specification.icon != null && (0, _builderUtil().isEmptyOrSpaces)(specification.icon)) {
      throw new (_builderUtil().InvalidConfigurationError)("dmg.icon cannot be specified as empty string");
    }

    const background = specification.background;

    if (specification.backgroundColor != null) {
      if (background != null) {
        throw new (_builderUtil().InvalidConfigurationError)("Both dmg.backgroundColor and dmg.background are specified — please set the only one");
      }

      specification.backgroundColor = (0, _dmgUtil().computeBackgroundColor)(specification.backgroundColor);
    } else if (background == null) {
      specification.background = await (0, _dmgUtil().computeBackground)(packager);
    } else {
      specification.background = path.resolve(packager.info.projectDir, background);
    }

    if (specification.format == null) {
      if (process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL != null) {
        specification.format = "UDZO";
      } else if (packager.compression === "store") {
        specification.format = "UDRO";
      } else {
        specification.format = packager.compression === "maximum" ? "UDBZ" : "UDZO";
      }
    }

    if (specification.contents == null) {
      specification.contents = [{
        x: 130,
        y: 220
      }, {
        x: 410,
        y: 220,
        type: "link",
        path: "/Applications"
      }];
    }

    return specification;
  }

}

exports.DmgTarget = DmgTarget;

async function createStageDmg(tempDmg, appPath, volumeName) {
  //noinspection SpellCheckingInspection
  const imageArgs = addLogLevel(["create", "-srcfolder", appPath, "-volname", volumeName, "-anyowners", "-nospotlight", "-format", "UDRW"]);
  imageArgs.push("-fs", "HFS+", "-fsargs", "-c c=64,a=16,e=16");
  imageArgs.push(tempDmg);
  await (0, _builderUtil().spawn)("hdiutil", imageArgs);
  return tempDmg;
}

function addLogLevel(args) {
  args.push(process.env.DEBUG_DMG === "true" ? "-verbose" : "-quiet");
  return args;
}

async function computeAssetSize(cancellationToken, dmgFile, specification, backgroundFile) {
  const asyncTaskManager = new (_builderUtil().AsyncTaskManager)(cancellationToken);
  asyncTaskManager.addTask((0, _fsExtraP().stat)(dmgFile));

  if (specification.icon != null) {
    asyncTaskManager.addTask((0, _fs().statOrNull)(specification.icon));
  }

  if (backgroundFile != null) {
    asyncTaskManager.addTask((0, _fsExtraP().stat)(backgroundFile));
  }

  let result = 32 * 1024;

  for (const stat of await asyncTaskManager.awaitTasks()) {
    if (stat != null) {
      result += stat.size;
    }
  }

  return result;
}

async function customizeDmg(volumePath, specification, packager, backgroundFile) {
  const window = specification.window;
  const env = Object.assign({}, process.env, {
    volumePath,
    appFileName: `${packager.appInfo.productFilename}.app`,
    iconSize: specification.iconSize || 80,
    iconTextSize: specification.iconTextSize || 12,
    windowX: window.x,
    windowY: window.y,
    VERSIONER_PERL_PREFER_32_BIT: "true"
  });

  if (specification.backgroundColor != null || specification.background == null) {
    env.backgroundColor = specification.backgroundColor || "#ffffff";
    env.windowWidth = (window.width || 540).toString();
    env.windowHeight = (window.height || 380).toString();
  } else {
    delete env.backgroundColor;

    if (window.width == null) {
      delete env.windowWidth;
    } else {
      env.windowWidth = window.width.toString();
    }

    if (window.height == null) {
      delete env.windowHeight;
    } else {
      env.windowHeight = window.height.toString();
    }
  }

  const args = ["dmg", "--volume", volumePath];

  if (specification.icon != null) {
    args.push("--icon", (await packager.getResource(specification.icon)));
  }

  if (backgroundFile != null) {
    env.backgroundFilename = path.basename(backgroundFile);
    args.push("--background", backgroundFile);
  }

  await (0, _builderUtil().executeAppBuilder)(args);
  const asyncTaskManager = new (_builderUtil().AsyncTaskManager)(packager.info.cancellationToken);
  await (0, _dmgUtil().applyProperties)((await computeDmgEntries(specification, volumePath, packager, asyncTaskManager)), env, asyncTaskManager, packager);
  return packager.packagerOptions.effectiveOptionComputed == null || !(await packager.packagerOptions.effectiveOptionComputed({
    volumePath,
    specification,
    packager
  }));
}

async function computeDmgEntries(specification, volumePath, packager, asyncTaskManager) {
  let result = "";

  for (const c of specification.contents) {
    if (c.path != null && c.path.endsWith(".app") && c.type !== "link") {
      _builderUtil().log.warn({
        path: c.path,
        reason: "actual path to app will be used instead"
      }, `do not specify path for application`);
    }

    const entryPath = c.path || `${packager.appInfo.productFilename}.app`;
    const entryName = c.name || path.basename(entryPath);
    result += `&makeEntries("${entryName}", Iloc_xy => [ ${c.x}, ${c.y} ]),\n`;

    if (c.type === "link") {
      asyncTaskManager.addTask((0, _builderUtil().exec)("ln", ["-s", `/${entryPath.startsWith("/") ? entryPath.substring(1) : entryPath}`, `${volumePath}/${entryName}`]));
    } // use c.path instead of entryPath (to be sure that this logic is not applied to .app bundle) https://github.com/electron-userland/electron-builder/issues/2147
    else if (!(0, _builderUtil().isEmptyOrSpaces)(c.path) && (c.type === "file" || c.type === "dir")) {
        const source = await packager.getResource(c.path);

        if (source == null) {
          _builderUtil().log.warn({
            entryPath,
            reason: "doesn't exist"
          }, `skipped DMG item copying`);

          continue;
        }

        const destination = `${volumePath}/${entryName}`;
        asyncTaskManager.addTask(c.type === "dir" || (await (0, _fsExtraP().stat)(source)).isDirectory() ? (0, _fs().copyDir)(source, destination) : (0, _fs().copyFile)(source, destination));
      }
  }

  return result;
} 
// __ts-babel@6.0.4
//# sourceMappingURL=dmg.js.map