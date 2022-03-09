// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { execSync } from "child_process";
import temp = require("temp");
import fs = require("fs");
import path = require("path");
import { window, ExtensionContext, extensions, env, Uri } from "vscode";
import { getWebPreview } from "./html/preview";

const extensionId = "ahnafnafee.postscript-preview";
let psConsole = vscode.window.createOutputChannel("PSPreview");
let reload = true;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    const isWindows = process.platform === "win32";

    if (isWindows) {
        showWhatsNew(context); // show notification in case of a minor release i.e. 1.1.0 -> 1.2.0
    }

    vscode.workspace.onDidSaveTextDocument(() => handleReload);

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand(
        "postscript-preview.sidePreview",
        () => {
            // Create new panel
            let panel = vscode.window.createWebviewPanel(
                "",
                "PostScript Preview",
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                }
            );

            // Get the EPS content
            const document = vscode.window.activeTextEditor?.document;

            if (!document) {
                // No active document
                console.log("No active document. Do nothing.");
                return;
            }

            if (reload) {
                createTempSVG(document, panel);
            }
        }
    );

    context.subscriptions.push(disposable);
}

// https://stackoverflow.com/a/66303259/3073272
function isMajorUpdate(previousVersion: string, currentVersion: string) {
	// rain-check for malformed string
	if (previousVersion.indexOf(".") === -1) {
		return true;
	}
	//returns int array [1,1,1] i.e. [major,minor,patch]
	var previousVerArr = previousVersion.split(".").map(Number);
	var currentVerArr = currentVersion.split(".").map(Number);

	// For pdftocairo bug fix
	if (currentVerArr[1] > previousVerArr[1]) {
		return true;
	} else {
		return false;
	}
}

async function showWhatsNew(context: ExtensionContext) {
	const previousVersion = context.globalState.get<string>(extensionId);
	const currentVersion = extensions.getExtension(extensionId)!.packageJSON
		.version;

	// store latest version
	context.globalState.update(extensionId, currentVersion);

	if (
		previousVersion === undefined ||
		isMajorUpdate(previousVersion, currentVersion)
	) {
		// show whats new notificatin:
		const actions = [{ title: "See Requirements" }];

		const result = await window.showInformationMessage(
			`PostScript Preview v${currentVersion} — READ NEW REQUIREMENTS!`,
			...actions
		);

		if (result !== null) {
			if (result === actions[0]) {
				await env.openExternal(
					Uri.parse(
						"https://github.com/ahnafnafee/PostScript-Preview#requirements"
					)
				);
			}
		}
	}
}

// this method is called when your extension is deactivated
export function deactivate() {}

const createTempSVG = async (
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel
) => {
    const filename = path.basename(document.fileName);
    let mainFilePath = document.fileName;

    temp.track();
    temp.open(
        { prefix: "postscript-preview-svg_", suffix: ".pdf" },
        function (pdfErr, pdfInfo) {
            if (pdfErr) {
                console.log("Creating temporary file eps-preview-pdf failed.");
                return;
            }
            temp.open(
                { prefix: "postscript-preview-svg_", suffix: ".svg" },
                function (svgErr, svgInfo) {
                    if (svgErr) {
                        console.log(
                            "Creating temporary file eps-preview-svg failed."
                        );
                        return;
                    }
                    // Transform EPS to SVG
                    // Thank https://superuser.com/a/769466/502597.
                    try {
                        execSync(
                            `ps2pdf -dEPSCrop "${mainFilePath}" "${pdfInfo.path}"`
                        );
                    } catch (err) {
                        vscode.window.showInformationMessage(
                            "Failed to execute ps2pdf. Report bug with postscript file to dev."
                        );
                        console.log("Error executing ps2pdf.");
                        console.log(err);
                        // Clean up
                        temp.cleanupSync();
                        return;
                    }
                    try {
                        execSync(
                            `pdftocairo -svg -f 1 -l 1 "${pdfInfo.path}" "${svgInfo.path}"`
                        );
                    } catch (err) {
                        vscode.window.showInformationMessage(
                            "Failed to execute pdftocairo. Report bug with postscript file to dev."
                        );
                        console.log("Error executing pdftocairo.");
                        console.log(err);
                        // Clean up
                        temp.cleanupSync();
                        return;
                    }
                    try {
                        const stat = fs.fstatSync(svgInfo.fd);
                        let svgContent = Buffer.alloc(stat.size);
                        fs.readSync(svgInfo.fd, svgContent, 0, stat.size, null);

                        // Show SVG in the webview panel
                        panel.webview.html = getWebPreview(
                            filename,
                            svgContent
                        );
                    } catch (err) {
                        console.log("Error reading the final file.");
                        console.log(err);
                    }
                }
            );
        }
    );

    // Clean up
    temp.cleanupSync();
};

async function handleReload() {
    psConsole.appendLine("Reload Called");
    reload = true;
    // throw new Error("Function not implemented.");
}
