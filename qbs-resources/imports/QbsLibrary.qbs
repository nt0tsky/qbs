import qbs
import qbs.FileInfo
import qbs.Utilities

QbsProduct {
    Depends { name: "cpp" }
    version: qbsversion.version
    type: libType
    targetName: (qbs.enableDebugCode && qbs.targetOS.contains("windows")) ? (name + 'd') : name
    cpp.defines: base.concat(visibilityType === "static" ? ["QBS_STATIC_LIB"] : ["QBS_LIBRARY"])
    cpp.sonamePrefix: qbs.targetOS.contains("darwin") ? "@rpath" : undefined
    Properties {
        condition: qbs.toolchain.contains("gcc")
        cpp.soVersion: version.replace(/\.\d+$/, '')
    }
    cpp.visibility: "minimal"
    property string visibilityType: staticBuild ? "static" : "dynamic"
    property string headerInstallPrefix: "/include/qbs"
    property bool hasExporter: Utilities.versionCompare(qbs.version, "1.12") >= 0
    property bool generatePkgConfigFile: qbsbuildconfig.generatePkgConfigFiles && hasExporter
    property bool generateQbsModule: install && qbsbuildconfig.generateQbsModules && hasExporter
    property bool staticBuild: Qt.core.staticBuild || qbsbuildconfig.staticBuild
    property stringList libType: [staticBuild ? "staticlibrary" : "dynamiclibrary"]

    Depends { name: "Exporter.pkgconfig"; condition: generatePkgConfigFile }
    Depends { name: "Exporter.qbs"; condition: generateQbsModule }

    Group {
        fileTagsFilter: libType.concat("dynamiclibrary_symlink")
            .concat(qbs.buildVariant === "debug" ? ["debuginfo_dll"] : [])
        qbs.install: install
        qbs.installDir: targetInstallDir
        qbs.installSourceBase: buildDirectory
    }
    targetInstallDir: qbsbuildconfig.libInstallDir
    Group {
        fileTagsFilter: ["dynamiclibrary_import"]
        qbs.install: install
        qbs.installDir: qbsbuildconfig.importLibInstallDir
    }
    Group {
        fileTagsFilter: "Exporter.pkgconfig.pc"
        qbs.install: install
        qbs.installDir: qbsbuildconfig.pkgConfigInstallDir
    }
    Group {
        fileTagsFilter: "Exporter.qbs.module"
        qbs.install: install
        qbs.installDir: FileInfo.joinPaths(qbsbuildconfig.qbsModulesBaseDir, product.name)
    }

    Properties {
        condition: qbs.targetOS.contains("darwin")
        bundle.isBundle: false
        cpp.linkerFlags: ["-compatibility_version", cpp.soVersion]
    }

    Export {
        Depends { name: "cpp" }
        Depends { name: "Qt"; submodules: ["core"] }

        Properties {
            condition: product.hasExporter
            prefixMapping: [{
                prefix: product.sourceDirectory,
                replacement: FileInfo.joinPaths(product.qbs.installPrefix,
                                                product.headerInstallPrefix)
            }]
        }

        cpp.includePaths: [product.sourceDirectory]
        cpp.defines: product.visibilityType === "static" ? ["QBS_STATIC_LIB"] : []
    }
}
