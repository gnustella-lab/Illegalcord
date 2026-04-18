import { MagnifyingGlassIcon } from "@components/Icons";
import SettingsPlugin from "@plugins/_core/settings";
import {
    mountKamidereRuntimeActivity,
    unmountKamidereRuntimeActivity,
} from "@shared/kamidere/runtimeActivity";
import { Devs } from "@utils/constants";
import { removeFromArray } from "@utils/misc";
import definePlugin from "@utils/types";

import MutualScannerTab from "./MutualScannerTab";
import { resetMutualScannerRuntime } from "./runtime";

const MUTUAL_SCANNER_SETTINGS_KEY = "kamidere_mutual_scanner";
const MUTUAL_SCANNER_SETTINGS_SECTION = "KamidereMutualScanner";

function unregisterMutualScannerSettingsTab() {
    while (SettingsPlugin.customEntries.some(entry => entry.key === MUTUAL_SCANNER_SETTINGS_KEY)) {
        removeFromArray(SettingsPlugin.customEntries, entry => entry.key === MUTUAL_SCANNER_SETTINGS_KEY);
    }

    while (SettingsPlugin.settingsSectionMap.some(entry => entry[1] === MUTUAL_SCANNER_SETTINGS_KEY)) {
        removeFromArray(SettingsPlugin.settingsSectionMap, entry => entry[1] === MUTUAL_SCANNER_SETTINGS_KEY);
    }

    SettingsPlugin.invalidateSectionLayout();
}

function registerMutualScannerSettingsTab() {
    unregisterMutualScannerSettingsTab();

    SettingsPlugin.customEntries.push({
        key: MUTUAL_SCANNER_SETTINGS_KEY,
        title: "Mutual Scanner",
        Component: MutualScannerTab,
        Icon: MagnifyingGlassIcon,
    });

    SettingsPlugin.settingsSectionMap.push([MUTUAL_SCANNER_SETTINGS_SECTION, MUTUAL_SCANNER_SETTINGS_KEY]);
    SettingsPlugin.invalidateSectionLayout();
}

export default definePlugin({
    name: "MutualScanner",
    description: "Scans selected servers for members that share at least one mutual friend with your account and saves the results locally.",
    authors: [Devs.clrxxo],
    dependencies: ["Settings"],
    enabledByDefault: true,
    tags: ["kamidere", "osint", "mutuals"],
    requiresRestart: false,
    settingsTab: {
        route: `${MUTUAL_SCANNER_SETTINGS_KEY}_panel`,
        title: "Mutual Scanner",
    },

    start() {
        mountKamidereRuntimeActivity();
        registerMutualScannerSettingsTab();
    },

    stop() {
        resetMutualScannerRuntime();
        unmountKamidereRuntimeActivity();
        unregisterMutualScannerSettingsTab();
    },
});
