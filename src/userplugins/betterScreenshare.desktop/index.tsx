/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { getIntlMessage } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { ChannelRTCStore, UserStore } from "@webpack/common";

import { PluginInfo } from "../betterScreenshare.desktop/constants";
import { openScreenshareModal } from "../betterScreenshare.desktop/modals";
import { ScreenshareAudioPatcher, ScreensharePatcher } from "../betterScreenshare.desktop/patchers";
import { GoLivePanelWrapper, replacedSubmitFunction } from "../betterScreenshare.desktop/patches";
import { initScreenshareAudioStore, initScreenshareStore, screenshareStore } from "../betterScreenshare.desktop/stores";
import { Emitter, ScreenshareSettingsIcon } from "../philsPluginLibrary";

const Button = findComponentByCodeLazy(".NONE,disabled:", ".PANEL_BUTTON");

interface StreamVideoQualityOptions {
    width?: number;
    height?: number;
    framerate?: number;
    pixelCount?: number;
}

interface StreamQualityOptions {
    bitrateMin?: number;
    bitrateMax?: number;
    bitrateTarget?: number;
    resolution?: number;
    frameRate?: number;
    framerate?: number;
    capture?: StreamVideoQualityOptions;
    encode?: StreamVideoQualityOptions;
}

interface StreamSubmitOptions extends StreamQualityOptions {
    quality?: unknown;
}

interface StreamFramerateOption {
    id: string;
    value: number;
    label: string;
}

function isStreamQualityOptions(opts: unknown): opts is StreamQualityOptions {
    return typeof opts === "object" && opts !== null && !Array.isArray(opts);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function screenshareSettingsButton() {

    return (
        <Button
            tooltipText="Change screenshare settings"
            icon={ScreenshareSettingsIcon}
            role="button"
            onClick={openScreenshareModal}
        />
    );
}

function patchStreamQuality(opts: StreamQualityOptions) {
    if (!screenshareStore) return opts;

    const { currentProfile } = screenshareStore.get();
    const {
        framerate,
        framerateEnabled,
        height,
        resolutionEnabled,
        videoBitrate,
        videoBitrateEnabled,
        width
    } = currentProfile;
    const next = { ...opts };
    let capture = opts.capture ? { ...opts.capture } : undefined;
    let encode = opts.encode ? { ...opts.encode } : undefined;

    if (videoBitrateEnabled && videoBitrate) {
        const bitrate = Math.round(videoBitrate * 1000);

        next.bitrateMin = bitrate;
        next.bitrateMax = bitrate;
        next.bitrateTarget = bitrate;
    }

    if (resolutionEnabled && width && height) {
        const pixelCount = width * height;

        next.resolution = height;
        capture = { ...capture, width, height, pixelCount };
        encode = { ...encode, width, height, pixelCount };
    }

    if (framerateEnabled && framerate) {
        next.frameRate = framerate;
        next.framerate = framerate;
        capture = { ...capture, framerate };
        encode = { ...encode, framerate };
    }

    if (capture) next.capture = capture;
    if (encode) next.encode = encode;

    return next;
}

function patchStreamSubmitOptions(opts: unknown) {
    if (!isStreamQualityOptions(opts)) return opts;

    const submitOptions = opts as StreamSubmitOptions;
    if (isStreamQualityOptions(submitOptions.quality))
        return { ...submitOptions, quality: patchStreamQuality(submitOptions.quality) };

    return patchStreamQuality(opts);
}

function patchGoLiveSource(source: unknown) {
    return patchStreamSubmitOptions(source);
}

function patchStreamFramerates(framerates: StreamFramerateOption[]) {
    if (!screenshareStore) return framerates;

    const { framerate, framerateEnabled } = screenshareStore.get().currentProfile;
    if (!framerateEnabled || !framerate) return framerates;

    const next = framerates.filter(option => option.value !== framerate);
    next.push({
        id: `${framerate}fps`,
        value: framerate,
        label: getIntlMessage("SCREENSHARE_FPS_ABBREVIATED", {
            fps: framerate
        })
    });

    return next.sort((a, b) => a.value - b.value);
}

function patchDisplayedStreamParticipant<T>(participant: T): T {
    if (!isRecord(participant) || !screenshareStore) return participant;

    const { stream } = participant;
    if (!isRecord(stream) || stream.ownerId !== UserStore.getCurrentUser().id) return participant;

    const { currentProfile } = screenshareStore.get();
    const {
        framerate,
        framerateEnabled,
        height,
        resolutionEnabled,
        width
    } = currentProfile;
    let next: Record<string, unknown> | undefined;

    if (framerateEnabled && framerate)
        next = { ...participant, maxFrameRate: framerate };

    if (resolutionEnabled && width && height)
        next = { ...(next ?? participant), maxResolution: { width, height } };

    return (next ?? participant) as T;
}

function patchDisplayedStreamParticipants<T>(participants: T[]): T[] {
    let changed = false;
    const next = participants.map(participant => {
        const patchedParticipant = patchDisplayedStreamParticipant(participant);
        changed ||= patchedParticipant !== participant;

        return patchedParticipant;
    });

    return changed ? next : participants;
}

function patchChannelRTCStore() {
    const oldGetFilteredParticipants = ChannelRTCStore.getFilteredParticipants;
    const oldGetParticipant = ChannelRTCStore.getParticipant;
    const oldGetParticipants = ChannelRTCStore.getParticipants;

    ChannelRTCStore.getFilteredParticipants = function (...args: Parameters<typeof oldGetFilteredParticipants>) {
        return patchDisplayedStreamParticipants(Reflect.apply(oldGetFilteredParticipants, this, args));
    };

    ChannelRTCStore.getParticipant = function (...args: Parameters<typeof oldGetParticipant>) {
        return patchDisplayedStreamParticipant(Reflect.apply(oldGetParticipant, this, args));
    };

    ChannelRTCStore.getParticipants = function (...args: Parameters<typeof oldGetParticipants>) {
        return patchDisplayedStreamParticipants(Reflect.apply(oldGetParticipants, this, args));
    };

    return () => {
        ChannelRTCStore.getFilteredParticipants = oldGetFilteredParticipants;
        ChannelRTCStore.getParticipant = oldGetParticipant;
        ChannelRTCStore.getParticipants = oldGetParticipants;
    };
}

export default definePlugin({
    name: "BetterScreenshare",
    description: "This plugin allows you to further customize your screen sharing.",
    tags: ["Voice", "Customisation"],
    authors: [Devs.phil],
    dependencies: ["PhilsPluginLibrary"],
    patches: [
        {
            find: "GoLiveModal: user cannot be undefined", // Module: 60594; canaryRelease: 364525; L431
            replacement: {
                match: /onSubmit:(\w+)/,
                replace: "onSubmit:$self.replacedSubmitFunction($1)"
            }
        },
        {
            find: "StreamSettings: user cannot be undefined", // Module: 641115; canaryRelease: 364525; L254
            replacement: {
                match: /\(.{0,10}(,{.{0,100}modalContent)/,
                replace: "($self.GoLivePanelWrapper$1"
            }
        },
        {
            find: ".StreamPreviewIntro", // Stream settings modal
            replacement: {
                match: /className:\i\.buttons,.{0,100}children:\[/,
                replace: "$&$self.screenshareSettingsButton(),"
            }
        },
        {
            find: "#{intl::STREAM_FPS_OPTION}",
            all: true,
            replacement: [
                {
                    match: /guildPremiumTier:\i\.\i\.TIER_\d,?/g,
                    replace: ""
                },
                {
                    match: /\[\{.{0,25}\i\.\i\.FPS_15.{0,900}\}\]/,
                    replace: "$self.patchStreamFramerates($&)"
                }
            ]
        },
        {
            find: "this.getDefaultGoliveQuality()",
            replacement: [
                {
                    match: /(this\.goliveMaxQuality)=(this\.getDefaultGoliveQuality\(\))/,
                    replace: "$1=$self.patchStreamQuality($2)"
                },
                {
                    match: /setGoliveQuality\((\i)\)\{/,
                    replace: "setGoliveQuality($1){$1=$self.patchStreamQuality($1);"
                }
            ]
        },
        {
            find: "setVideoBroadcast(this.shouldConnectionBroadcastVideo",
            replacement: {
                match: /setGoLiveSource\((\i),(\i)\)\{/,
                replace: "setGoLiveSource($1,$2){$1=$self.patchGoLiveSource($1);$2=$self.patchGoLiveSource($2);"
            }
        }
    ],
    settings: definePluginSettings({
        hideDefaultSettings: {
            type: OptionType.BOOLEAN,
            description: "Hide Discord screen sharing settings.",
            default: true,
        }
    }),
    start(): void {
        initScreenshareStore();
        initScreenshareAudioStore();
        this.unpatchChannelRTCStore?.();
        this.unpatchChannelRTCStore = patchChannelRTCStore();
        this.screensharePatcher = new ScreensharePatcher().patch();
        this.screenshareAudioPatcher = new ScreenshareAudioPatcher().patch();

    },
    stop(): void {
        this.unpatchChannelRTCStore?.();
        this.unpatchChannelRTCStore = undefined;
        this.screenshareAudioPatcher?.unpatch();
        this.screensharePatcher?.unpatch();
        Emitter.removeAllListeners(PluginInfo.PLUGIN_NAME);
    },
    toolboxActions: {
        "Open Screenshare Settings": openScreenshareModal
    },
    replacedSubmitFunction,
    GoLivePanelWrapper,
    patchGoLiveSource,
    patchStreamFramerates,
    patchStreamQuality,
    patchStreamSubmitOptions,
    screenshareSettingsButton
});
