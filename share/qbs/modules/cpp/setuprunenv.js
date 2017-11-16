/****************************************************************************
**
** Copyright (C) 2017 The Qt Company Ltd.
** Contact: http://www.qt.io/licensing
**
** This file is part of Qbs.
**
** Commercial License Usage
** Licensees holding valid commercial Qt licenses may use this file in
** accordance with the commercial license agreement provided with the
** Software or, alternatively, in accordance with the terms contained in
** a written agreement between you and The Qt Company. For licensing terms and
** conditions see http://www.qt.io/terms-conditions. For further information
** use the contact form at http://www.qt.io/contact-us.
**
** GNU Lesser General Public License Usage
** Alternatively, this file may be used under the terms of the GNU Lesser
** General Public License version 2.1 or version 3 as published by the Free
** Software Foundation and appearing in the file LICENSE.LGPLv21 and
** LICENSE.LGPLv3 included in the packaging of this file.  Please review the
** following information to ensure the GNU Lesser General Public License
** requirements will be met: https://www.gnu.org/licenses/lgpl.html and
** http://www.gnu.org/licenses/old-licenses/lgpl-2.1.html.
**
** In addition, as a special exception, The Qt Company gives you certain additional
** rights.  These rights are described in The Qt Company LGPL Exception
** version 1.1, included in the file LGPL_EXCEPTION.txt in this package.
**
****************************************************************************/

var FileInfo = require("qbs.FileInfo");
var ModUtils = require("qbs.ModUtils"); // TODO: append/prepend functionality should go to qbs.Environment

function addNewElement(list, elem)
{
    if (!list.contains(elem))
        list.push(elem);
}

function artifactDir(artifact, product)
{
    if (!artifact.qbs.install)
        return FileInfo.path(artifact.filePath);
    var installBaseDir = FileInfo.joinPaths(artifact.qbs.installRoot, artifact.qbs.installPrefix,
                                            artifact.qbs.installDir);
    var installSourceBase = artifact.qbs.installSourceBase;
    if (!installSourceBase)
        return installBaseDir;
    if (!FileInfo.isAbsolutePath(installSourceBase))
        installSourceBase = FileInfo.joinPaths(product.sourceDirectory, installSourceBase);
    var relativeInstallDir = FileInfo.path(FileInfo.relativePath(installSourceBase,
                                                                 artifact.filePath));
    return FileInfo.joinPaths(installBaseDir, relativeInstallDir);
}

function gatherPaths(product, libPaths, frameworkPaths)
{
    // Heuristic: If any rpaths are set, assume environment paths should not be set up.
    // Let's not try to be super fancy, evaluating all the rpaths, expanding $ORIGIN, relative paths
    // and whatnot.
    if (product.cpp.useRPaths && product.cpp.rpaths && product.cpp.rpaths.length > 0)
        return;

    // Gather explicitly given library paths.
    if (product.cpp.libraryPaths)
        product.cpp.libraryPaths.forEach(function(p) { addNewElement(libPaths, p); });
    if (product.cpp.frameworkPaths)
        product.cpp.frameworkPaths.forEach(function(p) { addNewElement(frameworkPaths, p); });

    // Extract paths from dynamic libraries, if they are given as file paths.
    if (product.cpp.dynamicLibraries) {
        product.cpp.dynamicLibraries.forEach(function(dll) {
            if (FileInfo.isAbsolutePath(dll))
                addNewElement(libPaths, FileInfo.path(dll));
        });
    }

    // Traverse library dependencies.
    for (var i = 0; i < product.dependencies.length; ++i) {
        var dep = product.dependencies[i];
        var dllSymlinkArtifacts = dep.artifacts["bundle.symlink.executable"];
        if (dllSymlinkArtifacts) {
            var addArtifact = function(artifact) {
                addNewElement(frameworkPaths, FileInfo.path(artifactDir(artifact, dep)));
            };
            dllSymlinkArtifacts.forEach(addArtifact); // TODO: Will also catch applications. Can we prevent that?
        } else {
            addArtifact = function(artifact) {
                addNewElement(libPaths, artifactDir(artifact, dep));
            };
            var dllArtifacts = dep.artifacts["dynamiclibrary"];
            if (dllArtifacts)
                dllArtifacts.forEach(addArtifact);
            var loadableModuleArtifacts = dep.artifacts["loadablemodule"];
            if (loadableModuleArtifacts)
                loadableModuleArtifacts.forEach(addArtifact);
        }
        if (!dep.hasOwnProperty("present")) // Recurse if the dependency is a product. TODO: Provide non-heuristic way to decide whether dependency is a product.
            gatherPaths(dep, libPaths, frameworkPaths);
    }
}


function setupRunEnvironment(product, config)
{
    if (config.contains("ignore-lib-dependencies"))
        return;

    // TODO: Uncomment once the property is available
//    if (product.qbs.hostPlatform != product.qbs.targetPlatform)
//        return;

    var libPaths = [];
    var frameworkPaths = [];
    gatherPaths(product, libPaths, frameworkPaths);

    var runPaths = product.cpp.systemRunPaths;
    if (runPaths && runPaths.length > 0) {
        var filterFunc = function(p) { return !runPaths.contains(p); };
        libPaths = libPaths.filter(filterFunc);
        frameworkPaths = frameworkPaths.filter(filterFunc);
    }

    if (libPaths.length > 0) {
        var envVarName;
        if (product.qbs.targetOS.contains("windows"))
            envVarName = "PATH";
        else if (product.qbs.targetOS.contains("macos"))
            envVarName = "DYLD_LIBRARY_PATH";
        else
            envVarName = "LD_LIBRARY_PATH";
        var envVar = new ModUtils.EnvironmentVariable(envVarName, product.qbs.pathListSeparator,
                                                      product.qbs.hostOS.contains("windows"));
        libPaths.forEach(function(p) { envVar.prepend(p); });
        envVar.set();
    }

    if (product.qbs.targetOS.contains("macos") && frameworkPaths.length > 0) {
        envVar = new ModUtils.EnvironmentVariable("DYLD_FRAMEWORK_PATH", ':', false);
        frameworkPaths.forEach(function(p) { envVar.prepend(p); });
        envVar.set();
    }
}
