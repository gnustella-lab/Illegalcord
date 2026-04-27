/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { UserStore } from "@webpack/common";

const logger = new Logger("GhostSelfbot");

function getGhostExePath(): string {
    const pluginDir = Vencord.Plugins.plugins.GhostSelfbot.constructor.toString().match(/at (.+)\/src\/userplugins/)?.[1];
    if (pluginDir) {
        return `${pluginDir}/src/userplugins/GhostSelfbot/Ghost.exe`;
    }
    return "";
}

function getGhostSourcePath(): string {
    const pluginDir = Vencord.Plugins.plugins.GhostSelfbot.constructor.toString().match(/at (.+)\/src\/userplugins/)?.[1];
    if (pluginDir) {
        return `${pluginDir}/src/userplugins/GhostSelfbot/ghost-4.2.0 (Source Code)`;
    }
    return "";
}

function getGhostConfigPath(): string {
    return `${process.env.APPDATA}\\Ghost\\config.json`;
}

function getGhostTokensPath(): string {
    return `${process.env.APPDATA}\\Ghost\\data\\sensitive\\tokens.json`;
}

function getGhostRequirementsPath(): string {
    const ghostSourcePath = getGhostSourcePath();
    return ghostSourcePath ? `${ghostSourcePath}\\requirements.txt` : "";
}

function checkPythonInstalled(pythonPath: string): boolean {
    try {
        const { execSync } = require("child_process");
        execSync(`${pythonPath} --version`, { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

function installRequirements(pythonPath: string): boolean {
    try {
        const { execSync } = require("child_process");
        const requirementsPath = getGhostRequirementsPath();

        if (!requirementsPath) {
            logger.error("Could not find requirements.txt path");
            return false;
        }

        const fs = require("fs");
        if (!fs.existsSync(requirementsPath)) {
            logger.error("requirements.txt not found in Ghost source directory");
            return false;
        }

        logger.log("Installing Python requirements...");
        execSync(`${pythonPath} -m pip install -r "${requirementsPath}"`, {
            stdio: "inherit"
        });

        logger.log("Python requirements installed successfully");
        return true;
    } catch (error) {
        logger.error("Failed to install requirements:", error);
        return false;
    }
}

interface GhostToken {
    token: string;
    username: string;
    id: string;
}

const settings = definePluginSettings({
    launchMode: {
        type: OptionType.SELECT,
        description: "Choose whether to launch Ghost.exe or the source code",
        default: "exe",
        options: [
            { label: "Ghost.exe (Compiled)", value: "exe", default: true },
            { label: "Source Code (Python)", value: "source" }
        ]
    },
    autoInstallRequirements: {
        type: OptionType.BOOLEAN,
        description: "Automatically install Python requirements (requirements.txt) when launching source code",
        default: true
    },
    autoFillToken: {
        type: OptionType.BOOLEAN,
        description: "Automatically fill your current Discord token into Ghost config",
        default: false
    },
    showTokenWarning: {
        type: OptionType.BOOLEAN,
        description: "Show a warning about token security before launching",
        default: true
    },
    pythonPath: {
        type: OptionType.STRING,
        description: "Path to Python executable (required for source code mode)",
        default: "python",
        placeholder: "python or C:\\Python311\\python.exe"
    }
});

function getCurrentDiscordToken(): string | null {
    try {
        const webpackModules = Object.values(window.webpackChunkdiscord_app.push([
            [""], {},
            (req: any) => {
                const cache = req.c;
                return Object.keys(cache).find((id: string) => cache[id]?.exports?.default?.getToken?.());
            }
        ]) as any[])[0];

        if (webpackModules) {
            return webpackModules.exports.default.getToken();
        }
    } catch (error) {
        logger.error("Failed to extract Discord token:", error);
    }
    return null;
}

function updateGhostConfig(token: string): boolean {
    try {
        const fs = require("fs");
        const ghostConfigPath = getGhostConfigPath();
        const ghostTokensPath = getGhostTokensPath();

        if (!fs.existsSync(ghostConfigPath)) {
            logger.error("Ghost config not found. Please run Ghost.exe first to create config.");
            return false;
        }

        const config = JSON.parse(fs.readFileSync(ghostConfigPath, "utf-8"));
        config.token = token;
        fs.writeFileSync(ghostConfigPath, JSON.stringify(config, null, 4));

        if (fs.existsSync(ghostTokensPath)) {
            const tokens: GhostToken[] = JSON.parse(fs.readFileSync(ghostTokensPath, "utf-8"));
            const currentUser = UserStore.getCurrentUser();
            const existingIndex = tokens.findIndex((t: GhostToken) => t.id === currentUser.id);

            if (existingIndex >= 0) {
                tokens[existingIndex].token = token;
                tokens[existingIndex].username = currentUser.username;
            } else {
                tokens.push({
                    token: token,
                    username: currentUser.username,
                    id: currentUser.id
                });
            }

            fs.writeFileSync(ghostTokensPath, JSON.stringify(tokens, null, 4));
        }

        return true;
    } catch (error) {
        logger.error("Failed to update Ghost config:", error);
        return false;
    }
}

function launchGhostExe(): void {
    const fs = require("fs");
    const ghostExePath = getGhostExePath();

    if (!ghostExePath || !fs.existsSync(ghostExePath)) {
        showNotification({
            title: "Ghost Selfbot",
            body: "Ghost.exe not found. Please ensure it exists in the plugin directory.",
            color: "#ED4245"
        });
        return;
    }

    if (settings.store.autoFillToken) {
        const token = getCurrentDiscordToken();
        if (token) {
            updateGhostConfig(token);
            logger.log("Token updated in Ghost config");
        }
    }

    try {
        const { shell } = require("electron");
        shell.openPath(ghostExePath);

        showNotification({
            title: "Ghost Selfbot",
            body: "Ghost.exe launched successfully",
            color: "#5865F2"
        });
    } catch (error) {
        logger.error("Failed to launch Ghost.exe:", error);
        showNotification({
            title: "Ghost Selfbot",
            body: "Failed to launch Ghost.exe",
            color: "#ED4245"
        });
    }
}

function launchGhostSource(): void {
    const fs = require("fs");
    const ghostSourcePath = getGhostSourcePath();
    const pythonPath = settings.store.pythonPath || "python";

    if (!ghostSourcePath || !fs.existsSync(ghostSourcePath)) {
        showNotification({
            title: "Ghost Selfbot",
            body: "Ghost source code not found. Please ensure it exists in the plugin directory.",
            color: "#ED4245"
        });
        return;
    }

    if (!checkPythonInstalled(pythonPath)) {
        showNotification({
            title: "Ghost Selfbot",
            body: `Python not found! Please install Python or configure the correct path in plugin settings. Current path: ${pythonPath}`,
            color: "#ED4245"
        });
        return;
    }

    if (settings.store.autoInstallRequirements) {
        showNotification({
            title: "Ghost Selfbot",
            body: "Installing Python requirements... Please wait.",
            color: "#5865F2"
        });

        if (!installRequirements(pythonPath)) {
            showNotification({
                title: "Ghost Selfbot",
                body: "Failed to install requirements. Check console for details.",
                color: "#ED4245"
            });
            return;
        }

        showNotification({
            title: "Ghost Selfbot",
            body: "Requirements installed successfully! Launching Ghost...",
            color: "#5865F2"
        });
    }

    if (settings.store.autoFillToken) {
        const token = getCurrentDiscordToken();
        if (token) {
            updateGhostConfig(token);
            logger.log("Token updated in Ghost config");
        }
    }

    try {
        const { spawn } = require("child_process");

        const ghostPy = `${ghostSourcePath}\\ghost.py`;

        if (!fs.existsSync(ghostPy)) {
            showNotification({
                title: "Ghost Selfbot",
                body: "ghost.py not found in source directory",
                color: "#ED4245"
            });
            return;
        }

        const child = spawn(pythonPath, [ghostPy], {
            cwd: ghostSourcePath,
            detached: true,
            stdio: "ignore"
        });

        child.unref();

        showNotification({
            title: "Ghost Selfbot",
            body: "Ghost source code launched successfully",
            color: "#5865F2"
        });
    } catch (error) {
        logger.error("Failed to launch Ghost source:", error);
        showNotification({
            title: "Ghost Selfbot",
            body: "Failed to launch Ghost source. Check Python path.",
            color: "#ED4245"
        });
    }
}

export default definePlugin({
    name: "GhostSelfbot",
    description: "Launch Ghost Selfbot (exe or source code) with optional auto-token fill from your current Discord session",
    authors: [{ name: "Hisako", id: 928787166916640838n }],
    tags: ["Utility", "Customisation", "Utils"],
    enabledByDefault: false,
    settings,

    commands: [
        {
            name: "ghost",
            description: "Launch Ghost Selfbot",
            execute: async (_args: any[], ctx: any) => {
                if (settings.store.showTokenWarning) {
                    const token = getCurrentDiscordToken();
                    if (token && settings.store.autoFillToken) {
                        ctx.channel.send({
                            content: "⚠️ **Warning:** Your Discord token will be written to Ghost config files. Never share these files with anyone!\n\n👻 Launching Ghost Selfbot..."
                        });
                    }
                }

                if (settings.store.launchMode === "exe") {
                    launchGhostExe();
                } else {
                    launchGhostSource();
                }
            }
        },
        {
            name: "ghost-install",
            description: "Install Ghost Selfbot Python requirements manually",
            execute: async (_args: any[], ctx: any) => {
                const pythonPath = settings.store.pythonPath || "python";

                if (!checkPythonInstalled(pythonPath)) {
                    ctx.channel.send({
                        content: `❌ **Python not found!** Please install Python or configure the correct path in plugin settings.\n\nCurrent path: \`${pythonPath}\``
                    });
                    return;
                }

                ctx.channel.send({
                    content: "📦 Installing Ghost Python requirements... This may take a moment."
                });

                if (installRequirements(pythonPath)) {
                    ctx.channel.send({
                        content: "✅ **Requirements installed successfully!** You can now launch Ghost from source code."
                    });
                } else {
                    ctx.channel.send({
                        content: "❌ **Failed to install requirements.** Check the console for error details."
                    });
                }
            }
        },
        {
            name: "ghost-check",
            description: "Check Ghost Selfbot setup (Python, requirements, files)",
            execute: async (_args: any[], ctx: any) => {
                const fs = require("fs");
                const pythonPath = settings.store.pythonPath || "python";
                const ghostSourcePath = getGhostSourcePath();
                const ghostExePath = getGhostExePath();

                let statusMessage = "🔍 **Ghost Selfbot Setup Check:**\n\n";

                statusMessage += ghostExePath && fs.existsSync(ghostExePath)
                    ? "✅ **Ghost.exe:** Found\n"
                    : "❌ **Ghost.exe:** Not found\n";

                statusMessage += ghostSourcePath && fs.existsSync(ghostSourcePath)
                    ? "✅ **Source Code:** Found\n"
                    : "❌ **Source Code:** Not found\n";

                statusMessage += checkPythonInstalled(pythonPath)
                    ? `✅ **Python:** Found (${pythonPath})\n`
                    : `❌ **Python:** Not found at \`${pythonPath}\`\n`;

                if (ghostSourcePath) {
                    const requirementsPath = getGhostRequirementsPath();
                    statusMessage += requirementsPath && fs.existsSync(requirementsPath)
                        ? "✅ **requirements.txt:** Found\n"
                        : "❌ **requirements.txt:** Not found\n";
                }

                ctx.channel.send({ content: statusMessage });
            }
        }
    ],

    start() {
        logger.log("Ghost Selfbot plugin loaded.");
        logger.log("Commands available: /ghost, /ghost-install, /ghost-check");
    },

    stop() {
        logger.log("Ghost Selfbot plugin stopped.");
    }
});
