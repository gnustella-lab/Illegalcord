/*
 * MullvadDNS Plugin
 * Forces Discord to use Mullvad DNS servers for enhanced privacy
 */

// @ts-ignore
import { definePluginSettings } from "@api/Settings";
// @ts-ignore
import definePlugin from "@utils/types";
// @ts-ignore
import { OptionType } from "@utils/types";

// Plugin settings
const settings = definePluginSettings({
  mullvadServer: {
    type: OptionType.SELECT,
    description: "Mullvad DNS server to use",
    options: [
      { label: "Base DNS (no filtering)", value: "dns.mullvad.net", default: true },
      { label: "Adblock (ads + trackers)", value: "adblock.dns.mullvad.net" },
      { label: "Base (ads + trackers + malware)", value: "base.dns.mullvad.net" },
      { label: "Extended (+ social media)", value: "extended.dns.mullvad.net" },
      { label: "Family (+ adult + gambling)", value: "family.dns.mullvad.net" },
      { label: "All (everything blocked)", value: "all.dns.mullvad.net" }
    ],
    default: "dns.mullvad.net"
  },
  enableLogging: {
    type: OptionType.BOOLEAN,
    description: "Enable detailed logging.",
    default: true
  },
  showNotifications: {
    type: OptionType.BOOLEAN,
    description: "Show toast notifications for DNS resolutions.",
    default: true
  },
  patchWebSocket: {
    type: OptionType.BOOLEAN,
    description: "Patch WebSocket connections for Discord gateway.",
    default: true
  },
  bypassCDN: {
    type: OptionType.BOOLEAN,
    description: "Bypass CDN domains for better performance.",
    default: false
  },
  dohTimeout: {
    type: OptionType.NUMBER,
    description: "DNS over HTTPS timeout in milliseconds.",
    default: 5000,
    min: 1000,
    max: 30000
  },
  cacheTTL: {
    type: OptionType.NUMBER,
    description: "DNS cache Time-To-Live in seconds.",
    default: 300,
    min: 60,
    max: 3600
  },
  enableFallback: {
    type: OptionType.BOOLEAN,
    description: "Fallback to original DNS if Mullvad fails.",
    default: true
  },
  autoStart: {
    type: OptionType.BOOLEAN,
    description: "Auto-start plugin on load.",
    default: true
  },
  logLevel: {
    type: OptionType.SELECT,
    description: "Logging level.",
    options: [
      { label: "Verbose", value: "verbose" },
      { label: "Info", value: "info" },
      { label: "Warning", value: "warn" },
      { label: "Error", value: "error" }
    ],
    default: "info"
  }
});

// @ts-ignore
export default definePlugin({
  name: "MullvadDNS",
  description: "Force Discord to use Mullvad DNS servers for enhanced privacy",
  tags: ["Privacy", "Utility"],
  authors: [{ name: "Irritably", id: 928787166916640838n }],
  settings,

  // Statistics tracking
  statistics: {
    totalRequests: 0,
    successfulResolutions: 0,
    failedResolutions: 0,
    cacheHits: 0
  },

  start() {
    // Plugin configuration
    const PLUGIN_NAME = "MullvadDNS";
    const VERSION = "1.3.0";

    // Official Mullvad DoH endpoints
    // Source: https://mullvad.net/en/help/dns-over-https-and-dns-over-tls
    const MULLVAD_DOH_ENDPOINTS: Record<string, string> = {
      "dns.mullvad.net": "https://dns.mullvad.net/dns-query",
      "adblock.dns.mullvad.net": "https://adblock.dns.mullvad.net/dns-query",
      "base.dns.mullvad.net": "https://base.dns.mullvad.net/dns-query",
      "extended.dns.mullvad.net": "https://extended.dns.mullvad.net/dns-query",
      "family.dns.mullvad.net": "https://family.dns.mullvad.net/dns-query",
      "all.dns.mullvad.net": "https://all.dns.mullvad.net/dns-query"
    };

    // Get selected Mullvad DoH endpoint
    const getSelectedDOHEndpoint = (): string => {
      return MULLVAD_DOH_ENDPOINTS[settings.store.mullvadServer] || MULLVAD_DOH_ENDPOINTS["dns.mullvad.net"];
    };

    // Discord services will use Mullvad DNS resolution
    const DISCORD_DOMAINS = [
      "discord.com",
      "gateway.discord.gg",
      "media.discordapp.net",
      "cdn.discordapp.com",
      "status.discord.com",
      "ptb.discord.com",
      "canary.discord.com",
      "discordapp.net"
    ];

    // CDN domains to bypass for better performance
    const CDN_DOMAINS = [
      "cdn.discordapp.com",
      "media.discordapp.net",
      "images-ext-1.discordapp.net",
      "images-ext-2.discordapp.net"
    ];

    // State management
    const originalFetch = window.fetch;
    const originalWebSocket = window.WebSocket;
    let isActive = false;
    
    // DNS Cache with TTL support
    interface CacheEntry {
      ip: string;
      timestamp: number;
      ttl: number;
    }
    const dnsCache = new Map<string, CacheEntry>();
    
    const statistics = {
      totalRequests: 0,
      dohQueries: 0,
      cacheHits: 0,
      cacheExpired: 0,
      fallbacks: 0,
      webSocketConnections: 0,
      errors: 0
    };

    // Advanced logger with colors and levels
    const log = {
      verbose: function (msg) {
        if (settings.store.enableLogging && settings.store.logLevel === "verbose") {
          console.debug(
            `%c[${PLUGIN_NAME}] %cVERBOSE: ${msg}`,
            "color: #9E9E9E; font-weight: bold",
            "color: #9E9E9E"
          );
        }
      },
      info: function (msg) {
        if (settings.store.enableLogging && ["verbose", "info"].includes(settings.store.logLevel)) {
          console.log(
            `%c[${PLUGIN_NAME}] %cINFO: ${msg}`,
            "color: #4CAF50; font-weight: bold",
            "color: #4CAF50"
          );
        }
      },
      warn: function (msg) {
        if (settings.store.enableLogging && ["verbose", "info", "warn"].includes(settings.store.logLevel)) {
          console.warn(
            `%c[${PLUGIN_NAME}] %cWARN: ${msg}`,
            "color: #FF9800; font-weight: bold",
            "color: #FF9800"
          );
        }
      },
      error: function (msg) {
        if (settings.store.enableLogging) {
          console.error(
            `%c[${PLUGIN_NAME}] %cERROR: ${msg}`,
            "color: #F44336; font-weight: bold",
            "color: #F44336"
          );
        }
      }
    };

    // Domains to exclude from DNS interception (whitelist)
    const EXCLUDED_DOMAINS = [
      // OAuth and authentication services
      "discord.com/api/v9/oauth2",
      "discord.com/api/oauth2",
      "discordapp.com/api/oauth2",
      // Cloud sync services
      "discord.com/api/v9/users/@me/settings-proto",
      "discord.com/api/v9/users/@me/applications-role-connection",
      // Critical API endpoints
      "discord.com/api/v9/auth",
      "discord.com/api/v9/verify",
      // CDN for critical assets
      "cdn.discordapp.com/attachments",
      "media.discordapp.net/attachments"
    ];

    // Check if URL should be excluded from DNS modification
    function shouldExcludeURL(url) {
      const urlString = url.toString().toLowerCase();

      // Check against excluded patterns
      for (const pattern of EXCLUDED_DOMAINS) {
        if (urlString.includes(pattern)) {
          log.verbose(`Excluding URL from DNS modification: ${url.hostname}${url.pathname}`);
          return true;
        }
      }

      // Exclude OAuth endpoints specifically
      if (url.pathname.includes("/oauth2/") || url.pathname.includes("/auth/")) {
        log.verbose(`Excluding OAuth endpoint: ${url.hostname}${url.pathname}`);
        return true;
      }

      return false;
    }

    // DNS over HTTPS resolver
    async function resolveDNSViaDoH(hostname: string): Promise<string | null> {
      const dohEndpoint = getSelectedDOHEndpoint();
      const dohURL = `${dohEndpoint}?name=${hostname}&type=A`;

      try {
        statistics.dohQueries++;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), settings.store.dohTimeout);

        const response = await fetch(dohURL, {
          method: "GET",
          headers: {
            "Accept": "application/dns-json"
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`DoH query failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Parse DNS response
        if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
          const answer = data.Answer.find((a: any) => a.type === 1); // Type 1 = A record
          if (answer && answer.data) {
            const ip = answer.data;
            const ttl = answer.TTL || settings.store.cacheTTL;

            // Cache the result with TTL
            dnsCache.set(hostname, {
              ip,
              timestamp: Date.now(),
              ttl: ttl * 1000 // Convert to milliseconds
            });

            log.verbose(`DoH resolved: ${hostname} -> ${ip} (TTL: ${ttl}s)`);
            return ip;
          }
        }

        log.warn(`DoH returned no answer for ${hostname}`);
        return null;

      } catch (error) {
        statistics.errors++;
        
        if (error instanceof Error && error.name === "AbortError") {
          log.error(`DoH timeout for ${hostname} (${settings.store.dohTimeout}ms)`);
        } else {
          log.error(`DoH error for ${hostname}: ${error}`);
        }

        // Fallback to original DNS if enabled
        if (settings.store.enableFallback) {
          statistics.fallbacks++;
          log.info(`Fallback to original DNS for ${hostname}`);
          return null; // Return null to use original hostname
        }

        return null;
      }
    }

    // Check if cache entry is valid
    function isCacheValid(entry: CacheEntry): boolean {
      const now = Date.now();
      const age = now - entry.timestamp;
      return age < entry.ttl;
    }

    // Enhanced DNS record lookup with DoH and TTL cache
    async function getDNSRecord(hostname: string): Promise<string | null> {
      statistics.totalRequests++;

      // Check cache first
      if (dnsCache.has(hostname)) {
        const entry = dnsCache.get(hostname)!;
        
        if (isCacheValid(entry)) {
          statistics.cacheHits++;
          log.verbose(`Cache hit: ${hostname} -> ${entry.ip}`);
          return entry.ip;
        } else {
          statistics.cacheExpired++;
          log.verbose(`Cache expired: ${hostname}`);
          dnsCache.delete(hostname);
        }
      }

      // Check if hostname should bypass DNS resolution
      const isCDN = settings.store.bypassCDN && CDN_DOMAINS.some(cdn => 
        hostname === cdn || hostname.endsWith(`.${cdn}`)
      );

      if (isCDN) {
        log.verbose(`Bypassing CDN: ${hostname}`);
        return null; // Use original hostname
      }

      // Resolve via DoH
      const ip = await resolveDNSViaDoH(hostname);
      return ip;
    }

    // Enhanced fetch patch with DoH
    function patchFetch() {
      if (!originalFetch) {
        log.error("Original fetch not found!");
        return false;
      }
    
      window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
        try {
          let urlStr = (input instanceof Request) ? input.url : String(input);
          const url = new URL(urlStr);
    
          // Check if this is a Discord-related hostname AND not excluded
          if (url.hostname.includes("discord") &&
            !url.hostname.includes("mullvad") &&
            !shouldExcludeURL(url)) {
                
            const ip = await getDNSRecord(url.hostname);
    
            if (ip) {
              // Replace hostname with resolved IP
              url.hostname = ip;
              urlStr = url.toString();
    
              log.info(`Resolved ${url.hostname} -> ${ip} (Mullvad DoH)`);
    
              // Show notification if enabled
              if (settings.store.showNotifications) {
                showNotification(`DNS resolved: ${url.hostname} -> ${ip}`, "success");
              }
            }
          } else {
            if (shouldExcludeURL(url)) {
              log.verbose(`Whitelisted URL skipped: ${url.hostname}${url.pathname}`);
            } else {
              log.verbose(`Skipping non-Discord host: ${url.hostname}`);
            }
          }
    
          // Call original fetch with modified URL
          const request = (input instanceof Request)
            ? new Request(urlStr, input)
            : urlStr;
    
          return originalFetch(request, init);
    
        } catch (error) {
          statistics.errors++;
          log.error(`Fetch patch error: ${error}`);
          return originalFetch(input, init);
        }
      };
    
      log.info("Fetch patched successfully");
      return true;
    }

    // WebSocket patch for Discord gateway with DoH
    async function patchWebSocket() {
      if (!settings.store.patchWebSocket) {
        log.info("WebSocket patching disabled");
        return true;
      }
    
      if (!originalWebSocket) {
        log.error("Original WebSocket not found!");
        return false;
      }
    
      window.WebSocket = class extends originalWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
              
          // Resolve DNS asynchronously after construction
          this.resolveDNS(url);
        }
    
        async resolveDNS(url: string | URL) {
          try {
            const urlStr = url.toString();
            const urlObj = new URL(urlStr);
    
            // Check if this is a Discord WebSocket connection
            if (urlObj.hostname.includes("discord") && !urlObj.hostname.includes("mullvad")) {
              const ip = await getDNSRecord(urlObj.hostname);
    
              if (ip) {
                statistics.webSocketConnections++;
                log.info(`WebSocket resolved: ${urlObj.hostname} -> ${ip} (Mullvad DoH)`);
    
                if (settings.store.showNotifications) {
                  showNotification(`WebSocket: ${urlObj.hostname} -> ${ip}`, "info");
                }
              }
            }
          } catch (error) {
            statistics.errors++;
            log.error(`WebSocket DNS resolution error: ${error}`);
          }
        }
      };
    
      log.info("WebSocket patched successfully");
      return true;
    }

    // Toast notification helper
    function showNotification(message, type = "info") {
      try {
        const toastModule = (window as any).Vencord?.Plugins?.Plugins?.Toasts;
        if (toastModule) {
          toastModule.show({
            message: `🔒 ${message}`,
            type: type === "success"
              ? toastModule.Type.SUCCESS
              : type === "error"
                ? toastModule.Type.FAILURE
                : toastModule.Type.MESSAGE,
            id: Date.now(),
            options: { position: toastModule.Position.BOTTOM }
          });
        } else {
          log[type === "error" ? "error" : "info"](message);
        }
      } catch (e) {
        log.verbose("Toast system not available, using console");
        log[type === "error" ? "error" : "info"](message);
      }
    }

    // Public API
    const MullvadDNS = {
      name: PLUGIN_NAME,
      version: VERSION,
      isActive: () => isActive,
      statistics,

      start: async () => {
        if (isActive) {
          log.warn("Plugin is already active!");
          return;
        }

        try {
          log.info(`Starting ${PLUGIN_NAME} v${VERSION}`);
          log.info(`Using Mullvad server: ${settings.store.mullvadServer} (${getSelectedDOHEndpoint()})`);

          const fetchSuccess = patchFetch();
          const wsSuccess = await patchWebSocket();

          if (fetchSuccess) {
            isActive = true;
            showNotification(`${PLUGIN_NAME} activated successfully`, "success");
            log.info(`Plugin started successfully with ${Object.keys(MULLVAD_DOH_ENDPOINTS).length} Mullvad DoH endpoints`);
            log.info(`Monitoring ${DISCORD_DOMAINS.length} Discord domains`);
            log.info(`WebSocket patch: ${settings.store.patchWebSocket ? "enabled" : "disabled"}`);
            log.info(`CDN bypass: ${settings.store.bypassCDN ? "enabled" : "disabled"}`);
          } else {
            throw new Error("Failed to patch network functions");
          }

        } catch (error) {
          log.error(`Failed to start plugin: ${error.message}`);
          showNotification(`${PLUGIN_NAME} failed to start`, "error");
        }
      },

      stop: () => {
        if (!isActive) {
          log.warn("Plugin is not active!");
          return;
        }

        try {
          log.info(`Stopping ${PLUGIN_NAME}`);

          if (originalFetch) {
            window.fetch = originalFetch;
            log.info("Fetch restored to original");
          }

          if (originalWebSocket) {
            window.WebSocket = originalWebSocket;
            log.info("WebSocket restored to original");
          }

          // Clear cache
          dnsCache.clear();
          isActive = false;

          showNotification(`${PLUGIN_NAME} deactivated`, "info");
          log.info("Plugin stopped successfully");

        } catch (error) {
          log.error(`Error stopping plugin: ${error.message}`);
        }
      },

      // Utility methods
      getDNSTable: () => ({ ...MULLVAD_DOH_ENDPOINTS }),
      getMonitoredDomains: () => [...DISCORD_DOMAINS],
      getCacheStats: () => ({
        cacheSize: dnsCache.size,
        cachedHostnames: Array.from(dnsCache.keys()),
        cacheEntries: Object.fromEntries(
          Array.from(dnsCache.entries()).map(([key, value]) => [key, value.ip])
        )
      }),
      getStatistics: () => ({ ...statistics }),
      getSelectedServer: () => settings.store.mullvadServer,
      clearStatistics: () => {
        statistics.totalRequests = 0;
        statistics.dohQueries = 0;
        statistics.cacheHits = 0;
        statistics.cacheExpired = 0;
        statistics.fallbacks = 0;
        statistics.webSocketConnections = 0;
        statistics.errors = 0;
        log.info("Statistics cleared");
      },
      clearCache: () => {
        const size = dnsCache.size;
        dnsCache.clear();
        log.info(`Cleared ${size} DNS cache entries`);
        return size;
      },
      addCustomRecord: (hostname, dohEndpoint) => {
        if (typeof hostname === "string" && typeof dohEndpoint === "string") {
          MULLVAD_DOH_ENDPOINTS[hostname] = dohEndpoint;
          log.info(`Added custom DoH endpoint: ${hostname} -> ${dohEndpoint}`);
          return true;
        }
        return false;
      },
      removeCustomRecord: (hostname) => {
        if (Object.prototype.hasOwnProperty.call(MULLVAD_DOH_ENDPOINTS, hostname)) {
          delete MULLVAD_DOH_ENDPOINTS[hostname];
          dnsCache.delete(hostname);
          log.info(`Removed DoH endpoint: ${hostname}`);
          return true;
        }
        return false;
      }
    };

    // Auto-start based on settings
    if (settings.store.autoStart) {
      setTimeout(() => {
        MullvadDNS.start();
      }, 2000);
    } else {
      log.info("Auto-start disabled. Plugin ready but not active.");
      showNotification(`${PLUGIN_NAME} loaded - start manually from settings`, "info");
    }

    // Expose API globally for debugging
    // @ts-ignore
    window.MullvadDNS = MullvadDNS;

    log.info(`${PLUGIN_NAME} v${VERSION} loaded and ready`);
    log.info(`Features: Logging=${settings.store.enableLogging}, Notifications=${settings.store.showNotifications}`);
  },

  stop() {
    // Clean shutdown
    try {
      if (typeof (window as any).MullvadDNS?.stop === "function") {
        (window as any).MullvadDNS.stop();
      }
      console.log("[MullvadDNS] Plugin stopped");
    } catch (error) {
      console.error("[MullvadDNS] Error during shutdown:", error);
    }
  }
});
