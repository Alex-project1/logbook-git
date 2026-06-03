import { Request, Response } from "express";
import { prisma } from "../../config/prisma";

type ExternalCityConfig = {
  externalRegionId: number;
  lat: number;
  lng: number;
};

type NormalizedObject = {
  accountNumber: string;
  title: string;
  clientName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  cardUrl: string | null;
  rawRegionId: number | null;
};

const DEFAULT_CITY_CONFIG_BY_NAME: Record<string, ExternalCityConfig> = {
  "київ": { externalRegionId: 1, lat: 50.4501, lng: 30.5234 },
  "киев": { externalRegionId: 1, lat: 50.4501, lng: 30.5234 },
  kyiv: { externalRegionId: 1, lat: 50.4501, lng: 30.5234 },

  "запоріжжя": { externalRegionId: 2, lat: 47.8388, lng: 35.1396 },
  "запорожье": { externalRegionId: 2, lat: 47.8388, lng: 35.1396 },
  zaporizhzhia: { externalRegionId: 2, lat: 47.8388, lng: 35.1396 },

  "дніпро": { externalRegionId: 3, lat: 48.4647, lng: 35.0462 },
  "днепр": { externalRegionId: 3, lat: 48.4647, lng: 35.0462 },
  dnipro: { externalRegionId: 3, lat: 48.4647, lng: 35.0462 },

  "львів": { externalRegionId: 4, lat: 49.8397, lng: 24.0297 },
  "львов": { externalRegionId: 4, lat: 49.8397, lng: 24.0297 },
  lviv: { externalRegionId: 4, lat: 49.8397, lng: 24.0297 },

  "павлоград": { externalRegionId: 5, lat: 48.5321, lng: 35.87 },
  pavlohrad: { externalRegionId: 5, lat: 48.5321, lng: 35.87 },

  "кам'янське": { externalRegionId: 6, lat: 48.511339, lng: 34.602103 },
  "каменское": { externalRegionId: 6, lat: 48.511339, lng: 34.602103 },
  kamianske: { externalRegionId: 6, lat: 48.511339, lng: 34.602103 },

  "кривий ріг": { externalRegionId: 8, lat: 47.9105, lng: 33.3918 },
  "кривой рог": { externalRegionId: 8, lat: 47.9105, lng: 33.3918 },
  "kryvyi rih": { externalRegionId: 8, lat: 47.9105, lng: 33.3918 },
};

const REGION_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const ASSET_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TILE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const jsonCache = new Map<string, { expiresAt: number; value: unknown }>();
const binaryCache = new Map<
  string,
  { expiresAt: number; contentType: string; buffer: Buffer }
>();

const ASSET_URLS: Record<string, string> = {
  "leaflet.css": "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "leaflet.js": "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "MarkerCluster.css":
    "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css",
  "MarkerCluster.Default.css":
    "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css",
  "leaflet.markercluster.js":
    "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js",
};

function getCached<T>(key: string): T | null {
  const cached = jsonCache.get(key);

  if (!cached || cached.expiresAt < Date.now()) {
    jsonCache.delete(key);
    return null;
  }

  return cached.value as T;
}

function setCached(key: string, value: unknown, ttlMs: number) {
  jsonCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    value,
  });
}

function normalizeCityName(name: string) {
  return name.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

function getObjectsApiBaseUrl() {
  return (process.env.OBJECTS_API_BASE_URL || "https://l-cs.ohholding.com.ua").replace(
    /\/$/,
    ""
  );
}

function getObjectsApiAuthHeader() {
  return process.env.OBJECTS_API_AUTH_HEADER?.trim() || "";
}

function parseEnvCityMap(): Record<string, ExternalCityConfig> {
  const raw = process.env.OBJECTS_CITY_REGION_MAP;

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<ExternalCityConfig>>;

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([cityId, value]) => {
          const externalRegionId = Number(value.externalRegionId);
          const lat = Number(value.lat);
          const lng = Number(value.lng);

          if (
            !Number.isFinite(externalRegionId) ||
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)
          ) {
            return null;
          }

          return [
            cityId,
            {
              externalRegionId,
              lat,
              lng,
            },
          ] as const;
        })
        .filter(Boolean) as Array<[string, ExternalCityConfig]>
    );
  } catch (error) {
    console.error("OBJECTS_CITY_REGION_MAP parse error:", error);
    return {};
  }
}

function getCityConfig(city: { id: number; name: string }): ExternalCityConfig | null {
  const envMap = parseEnvCityMap();
  const byId = envMap[String(city.id)];

  if (byId) {
    return byId;
  }

  return DEFAULT_CITY_CONFIG_BY_NAME[normalizeCityName(city.name)] ?? null;
}

function toNumberOrNull(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return numberValue;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function normalizeObject(raw: any): NormalizedObject {
  const coordinates = raw?.coordinates ?? {};

  const lat = toNumberOrNull(
    coordinates.lat ??
      coordinates.latitude ??
      raw?.lat ??
      raw?.latitude ??
      raw?.object_lat
  );

  const lng = toNumberOrNull(
    coordinates.lng ??
      coordinates.lon ??
      coordinates.long ??
      coordinates.longitude ??
      raw?.lng ??
      raw?.lon ??
      raw?.long ??
      raw?.longitude ??
      raw?.object_lng
  );

  return {
    accountNumber: firstString(
      raw?.account_number,
      raw?.accountNumber,
      raw?.object_account_number,
      raw?.number,
      raw?.account
    ),
    title: firstString(raw?.object_title, raw?.title, raw?.name),
    clientName: firstString(raw?.client_name, raw?.clientName, raw?.client),
    address: firstString(raw?.object_address, raw?.address),
    lat,
    lng,
    cardUrl: firstString(raw?.object_card_url, raw?.cardUrl, raw?.card_url) || null,
    rawRegionId: toNumberOrNull(raw?.region_id ?? raw?.regionId ?? raw?.city_id ?? raw?.cityId),
  };
}

async function fetchObjectsApi(path: string, cacheKey: string, ttlMs: number) {
  const cached = getCached<unknown>(cacheKey);

  if (cached) {
    return cached;
  }

  const authHeader = getObjectsApiAuthHeader();

  if (!authHeader) {
    throw new Error(
      "OBJECTS_API_AUTH_HEADER is not configured. Add it to backend .env"
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${getObjectsApiBaseUrl()}${path}`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        body?.message || body?.detail || `Objects API error ${response.status}`
      );
    }

    setCached(cacheKey, body, ttlMs);
    return body;
  } finally {
    clearTimeout(timeout);
  }
}


async function getCurrentMobileCity(req: Request) {
  if (!req.mobileUser) {
    return null;
  }

  return prisma.city.findFirst({
    where: {
      id: req.mobileUser.cityId,
      deletedAt: null,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
    },
  });
}

async function loadRegionObjects(cityConfig: ExternalCityConfig) {
  const result = await fetchObjectsApi(
    `/api/v2/object-card/coordinate/by-region/${cityConfig.externalRegionId}`,
    `region:${cityConfig.externalRegionId}`,
    REGION_CACHE_TTL_MS
  );

  const data = Array.isArray((result as any)?.data) ? (result as any).data : [];

  return data.map(normalizeObject).filter(hasValidCoordinates);
}

function hasValidCoordinates(object: NormalizedObject) {
  return (
    typeof object.lat === "number" &&
    typeof object.lng === "number" &&
    Number.isFinite(object.lat) &&
    Number.isFinite(object.lng) &&
    object.lat >= -90 &&
    object.lat <= 90 &&
    object.lng >= -180 &&
    object.lng <= 180 &&
    !(object.lat === 0 && object.lng === 0)
  );
}

type BBox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

function parseBBox(req: Request): BBox | null {
  const south = Number(req.query.south);
  const west = Number(req.query.west);
  const north = Number(req.query.north);
  const east = Number(req.query.east);

  if (
    !Number.isFinite(south) ||
    !Number.isFinite(west) ||
    !Number.isFinite(north) ||
    !Number.isFinite(east)
  ) {
    return null;
  }

  return {
    south: Math.max(-90, Math.min(90, Math.min(south, north))),
    north: Math.max(-90, Math.min(90, Math.max(south, north))),
    west: Math.max(-180, Math.min(180, Math.min(west, east))),
    east: Math.max(-180, Math.min(180, Math.max(west, east))),
  };
}

function getClusterCellSize(zoom: number) {
  if (zoom <= 8) return 0.35;
  if (zoom === 9) return 0.18;
  if (zoom === 10) return 0.09;
  if (zoom === 11) return 0.045;
  if (zoom === 12) return 0.022;
  if (zoom === 13) return 0.011;
  if (zoom === 14) return 0.0055;
  if (zoom === 15) return 0.0028;
  if (zoom === 16) return 0.0014;
  return 0.0007;
}

function createClusterResponse(objects: NormalizedObject[], zoom: number, bbox: BBox | null) {
  const filtered = bbox
    ? objects.filter(
        (object) =>
          object.lat !== null &&
          object.lng !== null &&
          object.lat >= bbox.south &&
          object.lat <= bbox.north &&
          object.lng >= bbox.west &&
          object.lng <= bbox.east
      )
    : objects;

  const cellSize = getClusterCellSize(zoom);
  const groups = new Map<string, NormalizedObject[]>();

  for (const object of filtered) {
    const latKey = Math.floor((object.lat as number) / cellSize);
    const lngKey = Math.floor((object.lng as number) / cellSize);
    const key = `${latKey}:${lngKey}`;
    const group = groups.get(key);

    if (group) {
      group.push(object);
    } else {
      groups.set(key, [object]);
    }
  }

  const data = Array.from(groups.entries()).map(([key, group]) => {
    if (group.length === 1) {
      const object = group[0];

      return {
        id: `object:${object.accountNumber || key}`,
        type: "object",
        lat: object.lat,
        lng: object.lng,
        count: 1,
        accountNumber: object.accountNumber,
        title: object.title,
        clientName: object.clientName,
        address: object.address,
        cardUrl: object.cardUrl,
      };
    }

    const sum = group.reduce(
      (acc, object) => {
        acc.lat += object.lat as number;
        acc.lng += object.lng as number;
        return acc;
      },
      { lat: 0, lng: 0 }
    );

    return {
      id: `cluster:${key}`,
      type: "cluster",
      lat: sum.lat / group.length,
      lng: sum.lng / group.length,
      count: group.length,
      accountNumber: null,
      title: null,
      clientName: null,
      address: null,
      cardUrl: null,
    };
  });

  data.sort((a, b) => b.count - a.count);

  return {
    total: objects.length,
    visible: filtered.length,
    data,
  };
}

export async function getMobileObjectsOverview(req: Request, res: Response) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const city = await getCurrentMobileCity(req);

    if (!city) {
      return res.status(404).json({ message: "City not found" });
    }

    const cityConfig = getCityConfig(city);

    if (!cityConfig) {
      return res.status(400).json({
        message:
          "Objects external region is not configured for this city. Add OBJECTS_CITY_REGION_MAP to backend .env",
        city,
      });
    }

    const objects = await loadRegionObjects(cityConfig);

    return res.json({
      city,
      externalRegionId: cityConfig.externalRegionId,
      center: {
        lat: cityConfig.lat,
        lng: cityConfig.lng,
      },
      total: objects.length,
    });
  } catch (error) {
    console.error("getMobileObjectsOverview error:", error);

    return res.status(500).json({
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

export async function getMobileObjectClusters(req: Request, res: Response) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const city = await getCurrentMobileCity(req);

    if (!city) {
      return res.status(404).json({ message: "City not found" });
    }

    const cityConfig = getCityConfig(city);

    if (!cityConfig) {
      return res.status(400).json({
        message:
          "Objects external region is not configured for this city. Add OBJECTS_CITY_REGION_MAP to backend .env",
        city,
      });
    }

    const zoomRaw = Number(req.query.zoom);
    const zoom = Number.isFinite(zoomRaw)
      ? Math.max(1, Math.min(19, Math.round(zoomRaw)))
      : 12;
    const bbox = parseBBox(req);
    const objects = await loadRegionObjects(cityConfig);
    const clustered = createClusterResponse(objects, zoom, bbox);

    return res.json({
      city,
      externalRegionId: cityConfig.externalRegionId,
      center: {
        lat: cityConfig.lat,
        lng: cityConfig.lng,
      },
      zoom,
      ...clustered,
    });
  } catch (error) {
    console.error("getMobileObjectClusters error:", error);

    return res.status(500).json({
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

export async function getMobileObjects(req: Request, res: Response) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const city = await prisma.city.findFirst({
      where: {
        id: req.mobileUser.cityId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!city) {
      return res.status(404).json({
        message: "City not found",
      });
    }

    const cityConfig = getCityConfig(city);

    if (!cityConfig) {
      return res.status(400).json({
        message:
          "Objects external region is not configured for this city. Add OBJECTS_CITY_REGION_MAP to backend .env",
        city,
      });
    }

    const result = await fetchObjectsApi(
      `/api/v2/object-card/coordinate/by-region/${cityConfig.externalRegionId}`,
      `region:${cityConfig.externalRegionId}`,
      REGION_CACHE_TTL_MS
    );

    const data = Array.isArray((result as any)?.data) ? (result as any).data : [];

    return res.json({
      city,
      externalRegionId: cityConfig.externalRegionId,
      center: {
        lat: cityConfig.lat,
        lng: cityConfig.lng,
      },
      data: data.map(normalizeObject),
    });
  } catch (error) {
    console.error("getMobileObjects error:", error);

    return res.status(500).json({
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

export async function searchMobileObject(req: Request, res: Response) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const accountNumber = String(req.query.accountNumber || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    if (!accountNumber) {
      return res.status(400).json({
        message: "accountNumber is required",
      });
    }

    if (!/^[A-ZА-ЯІЇЄҐ0-9_-]{1,40}$/i.test(accountNumber)) {
      return res.status(400).json({
        message: "Invalid account number",
      });
    }

    const result = await fetchObjectsApi(
      `/api/v2/object-card/by-account-number/${encodeURIComponent(accountNumber)}`,
      `search:${accountNumber}`,
      SEARCH_CACHE_TTL_MS
    );

    const data = Array.isArray((result as any)?.data) ? (result as any).data : [];

    return res.json({
      data: data.map(normalizeObject),
    });
  } catch (error) {
    console.error("searchMobileObject error:", error);

    return res.status(500).json({
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

export async function getMobileObjectsMapAsset(req: Request, res: Response) {
  try {
    const asset = String(req.params.asset || "");
    const url = ASSET_URLS[asset];

    if (!url) {
      return res.status(404).send("Asset not found");
    }

    const cacheKey = `asset:${asset}`;
    const cached = binaryCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(cached.buffer);
    }

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).send("Asset load error");
    }

    let text = await response.text();
    const contentType = response.headers.get("content-type") || getAssetContentType(asset);

    // Leaflet CSS references image files. In our Android map markers use default markers,
    // but external relative image requests are not needed for the core map.
    text = text.replace(/url\((images\/[^)]+)\)/g, "url(about:blank)");

    const buffer = Buffer.from(text, "utf8");

    binaryCache.set(cacheKey, {
      expiresAt: Date.now() + ASSET_CACHE_TTL_MS,
      contentType,
      buffer,
    });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(buffer);
  } catch (error) {
    console.error("getMobileObjectsMapAsset error:", error);
    return res.status(500).send("Asset proxy error");
  }
}

function getAssetContentType(asset: string) {
  if (asset.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (asset.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }

  return "text/plain; charset=utf-8";
}

export async function getMobileObjectsMapTile(req: Request, res: Response) {
  try {
    const z = Number(req.params.z);
    const x = Number(req.params.x);
    const y = Number(req.params.y);

    if (
      !Number.isInteger(z) ||
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      z < 0 ||
      z > 19 ||
      x < 0 ||
      y < 0
    ) {
      return res.status(400).send("Invalid tile");
    }

    const cacheKey = `tile:${z}:${x}:${y}`;
    const cached = binaryCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Cache-Control", "public, max-age=21600");
      return res.send(cached.buffer);
    }

    const tileUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

    const response = await fetch(tileUrl, {
      headers: {
        "User-Agent": "RouteMasterMobile/1.0",
      },
    });

    if (!response.ok) {
      return res.status(response.status).send("Tile load error");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/png";

    binaryCache.set(cacheKey, {
      expiresAt: Date.now() + TILE_CACHE_TTL_MS,
      contentType,
      buffer,
    });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=21600");
    return res.send(buffer);
  } catch (error) {
    console.error("getMobileObjectsMapTile error:", error);
    return res.status(500).send("Tile proxy error");
  }
}
