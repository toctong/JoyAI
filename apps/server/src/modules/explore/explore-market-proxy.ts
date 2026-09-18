/**
 * Outbound proxy for PixAI / Civitai explore sources only.
 * Prefer admin setting `explore.marketProxy`, then env EXPLORE_MARKET_PROXY.
 */
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import type { AxiosRequestConfig } from "axios";

export const EXPLORE_MARKET_PROXY_SETTING_KEY = "explore.marketProxy";

const MARKET_HOSTS = new Set([
  "civitai.com",
  "image.civitai.com",
  "pixai.art",
  "api.pixai.art",
  "www.pixai.art",
]);

type ProxyResolver = () => Promise<string | null>;

let resolver: ProxyResolver | null = null;
let agent: HttpsProxyAgent<string> | null = null;
let agentUrl: string | null = null;

/** Wire SettingsService (or similar) from ExploreModule bootstrap. */
export function configureMarketProxyResolver(fn: ProxyResolver) {
  resolver = fn;
  agent = null;
  agentUrl = null;
}

export function isMarketProxyHost(url: string): boolean {
  try {
    return MARKET_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function resolveProxyUrl(): Promise<string | null> {
  if (resolver) {
    try {
      const fromSettings = String((await resolver()) ?? "").trim();
      if (fromSettings) return fromSettings;
    } catch {
      // fall through to env
    }
  }
  const fromEnv = String(process.env.EXPLORE_MARKET_PROXY ?? "").trim();
  return fromEnv || null;
}

async function getAgent(): Promise<HttpsProxyAgent<string> | null> {
  const url = await resolveProxyUrl();
  if (!url) return null;
  if (!agent || agentUrl !== url) {
    agent = new HttpsProxyAgent(url);
    agentUrl = url;
  }
  return agent;
}

/** Axios config fragment — only for PixAI / Civitai hosts. */
export async function marketProxyAxiosConfig(
  targetUrl: string,
): Promise<Pick<AxiosRequestConfig, "httpAgent" | "httpsAgent" | "proxy">> {
  if (!isMarketProxyHost(targetUrl)) return {};
  const a = await getAgent();
  if (!a) return {};
  return {
    proxy: false,
    httpAgent: a,
    httpsAgent: a,
  };
}

export function invalidateMarketProxy(reason?: string) {
  void resolveProxyUrl().then((url) => {
    if (reason) {
      // eslint-disable-next-line no-console
      console.warn(
        `[explore-market-proxy] ${reason} (proxy=${url || "none"})`,
      );
    }
  });
  agent = null;
  agentUrl = null;
}

export type MarketProxyProbeTarget = {
  id: "civitai" | "pixai";
  label: string;
  ok: boolean;
  status: number | null;
  ms: number;
  error: string | null;
};

export type MarketProxyProbeResult = {
  proxy: string | null;
  ok: boolean;
  targets: MarketProxyProbeTarget[];
};

/** Probe Civitai + PixAI through an explicit proxy URL (or resolved setting/env). */
export async function probeMarketProxy(
  proxyOverride?: string | null,
): Promise<MarketProxyProbeResult> {
  const proxy =
    String(proxyOverride ?? "").trim() || (await resolveProxyUrl());
  const targets: MarketProxyProbeTarget[] = [];

  const checks: Array<{
    id: "civitai" | "pixai";
    label: string;
    url: string;
    method: "get" | "post";
    body?: unknown;
    /** Optional response validator after HTTP success. */
    accept?: (status: number, data: unknown) => boolean;
  }> = [
    {
      id: "civitai",
      label: "Civitai",
      url: "https://civitai.com/api/v1/models?limit=1&nsfw=false",
      method: "get",
    },
    {
      id: "pixai",
      label: "PixAI GraphQL",
      url: "https://api.pixai.art/graphql?operation=generationModels",
      method: "post",
      body: {
        operationName: "generationModels",
        query: `query generationModels($first: Int) {
          generationModels(first: $first) {
            edges { node { id title media { id urls { variant url } } } }
          }
        }`,
        variables: { first: 1 },
      },
      accept: (status, data) => {
        if (status < 200 || status >= 300) return false;
        const payload = data as {
          data?: { generationModels?: { edges?: unknown[] } };
          errors?: unknown[];
        };
        return (
          !payload?.errors?.length &&
          Array.isArray(payload?.data?.generationModels?.edges)
        );
      },
    },
  ];

  for (const check of checks) {
    const started = Date.now();
    let lastError: string | null = null;
    let lastStatus: number | null = null;
    let ok = false;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const agentOrUndef = proxy
          ? new HttpsProxyAgent(proxy)
          : undefined;
        const res =
          check.method === "post"
            ? await axios.post(check.url, check.body, {
                timeout: 20_000,
                validateStatus: () => true,
                proxy: false,
                ...(agentOrUndef
                  ? { httpAgent: agentOrUndef, httpsAgent: agentOrUndef }
                  : {}),
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  "User-Agent": "JoyAI/0.1 (+explore-market-proxy-probe)",
                  Origin: "https://pixai.art",
                  Referer: "https://pixai.art/zh/market",
                },
              })
            : await axios.get(check.url, {
                timeout: 20_000,
                validateStatus: () => true,
                proxy: false,
                ...(agentOrUndef
                  ? { httpAgent: agentOrUndef, httpsAgent: agentOrUndef }
                  : {}),
                headers: {
                  Accept: "application/json",
                  "User-Agent": "JoyAI/0.1 (+explore-market-proxy-probe)",
                },
              });
        lastStatus = res.status;
        const accepted = check.accept
          ? check.accept(res.status, res.data)
          : res.status > 0 && res.status < 500;
        if (accepted) {
          ok = true;
          lastError = null;
          break;
        }
        lastError = `HTTP ${res.status}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }

    targets.push({
      id: check.id,
      label: check.label,
      ok,
      status: lastStatus,
      ms: Date.now() - started,
      error: ok ? null : lastError,
    });
  }

  return {
    proxy: proxy || null,
    ok: targets.every((t) => t.ok),
    targets,
  };
}
