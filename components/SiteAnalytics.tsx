"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect, useRef } from "react";

type AnalyticsEvent = {
  eventType: string;
  visitorId: string;
  sessionId: string;
  path?: string;
  previousPath?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  interactionName?: string | null;
  interactionLabel?: string | null;
  durationMs?: number;
  activeMs?: number;
  maxScrollPercent?: number;
  metricName?: string;
  metricValue?: number;
  viewportCategory?: string;
  colorScheme?: string;
  connectionType?: string | null;
  navigationType?: string | null;
  errorMessage?: string;
  errorSource?: string | null;
  errorLine?: number | null;
  errorColumn?: number | null;
};

type PageState = {
  path: string;
  startedAt: number;
  activeStartedAt: number | null;
  activeMs: number;
  maxScrollPercent: number;
};

function createUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(
    /[018]/g,
    (character) =>
      (
        Number(character) ^
        (crypto.getRandomValues(new Uint8Array(1))[0] &
          (15 >> (Number(character) / 4)))
      ).toString(16),
  );
}

function sessionId(): string {
  const key = "suas_analytics_session";
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = createUuid();
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return createUuid();
  }
}

function visitorId(): string {
  const key = "suas_analytics_visitor_id";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = createUuid();
    localStorage.setItem(key, created);
    return created;
  } catch {
    return createUuid();
  }
}

function viewportCategory(): string {
  if (window.innerWidth < 640) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}

function safeReferrer(): string | null {
  if (!document.referrer) return null;
  try {
    const referrer = new URL(document.referrer);
    return `${referrer.origin}${referrer.pathname}`;
  } catch {
    return null;
  }
}

function connectionType(): string | null {
  const connection = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    }
  ).connection;
  if (!connection) return null;
  const type = connection.effectiveType || "unknown";
  return connection.saveData ? `${type}:save-data` : type;
}

function navigationType(): string | null {
  const navigation = performance.getEntriesByType(
    "navigation",
  )[0] as PerformanceNavigationTiming | undefined;
  return navigation?.type || null;
}

function utmFields() {
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    utmContent: params.get("utm_content"),
  };
}

function postEvent(event: AnalyticsEvent, beacon = false) {
  if (window.location.hostname !== "suasstem.org") return;
  const payload = JSON.stringify(event);

  if (beacon && navigator.sendBeacon) {
    try {
      navigator.sendBeacon(
        "/api/analytics",
        new Blob([payload], { type: "application/json" }),
      );
      return;
    } catch {
      // Fall through to best-effort fetch.
    }
  }

  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: beacon,
    credentials: "same-origin",
  }).catch(() => undefined);
}

export default function SiteAnalytics() {
  const pathname = usePathname();
  const visitorIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const previousPathRef = useRef<string | null>(null);
  const pageRef = useRef<PageState | null>(null);
  const errorCountRef = useRef(0);
  const seenImpressionsRef = useRef(new Set<string>());

  useReportWebVitals((metric) => {
    if (visitorIdRef.current === null) {
      visitorIdRef.current = visitorId();
    }
    if (sessionIdRef.current === null) {
      sessionIdRef.current = sessionId();
    }
    if (!visitorIdRef.current || !sessionIdRef.current) return;
    postEvent({
      eventType: "web_vital",
      visitorId: visitorIdRef.current,
      sessionId: sessionIdRef.current,
      path: window.location.pathname,
      metricName: metric.name,
      metricValue: metric.value,
    });
  });

  useEffect(() => {
    if (visitorIdRef.current === null) {
      visitorIdRef.current = visitorId();
    }
    if (sessionIdRef.current === null) {
      sessionIdRef.current = sessionId();
    }
    const vid = visitorIdRef.current;
    const sid = sessionIdRef.current;
    if (!vid || !sid || window.location.hostname !== "suasstem.org") return;

    const finishPage = (beacon: boolean) => {
      const page = pageRef.current;
      if (!page) return;
      const now = performance.now();
      let activeMs = page.activeMs;
      if (page.activeStartedAt !== null) {
        activeMs += now - page.activeStartedAt;
      }
      postEvent(
        {
          eventType: "page_summary",
          visitorId: vid,
          sessionId: sid,
          path: page.path,
          durationMs: Math.round(now - page.startedAt),
          activeMs: Math.round(activeMs),
          maxScrollPercent: page.maxScrollPercent,
        },
        beacon,
      );
      pageRef.current = null;
    };

    finishPage(true);

    const now = performance.now();
    pageRef.current = {
      path: pathname,
      startedAt: now,
      activeStartedAt: document.visibilityState === "visible" ? now : null,
      activeMs: 0,
      maxScrollPercent: 0,
    };

    postEvent({
      eventType: "page_view",
      visitorId: vid,
      sessionId: sid,
      path: pathname,
      previousPath: previousPathRef.current,
      referrer: previousPathRef.current ? null : safeReferrer(),
      ...utmFields(),
      viewportCategory: viewportCategory(),
      colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
      connectionType: connectionType(),
      navigationType: previousPathRef.current ? "spa" : navigationType(),
    });
    previousPathRef.current = pathname;

    let lastScrollUpdate = 0;
    const updateScroll = () => {
      const page = pageRef.current;
      if (!page) return;
      const timestamp = performance.now();
      if (timestamp - lastScrollUpdate < 200) return;
      lastScrollUpdate = timestamp;
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
      const percent =
        scrollable <= 0
          ? 100
          : Math.round((window.scrollY / scrollable) * 100);
      page.maxScrollPercent = Math.max(
        page.maxScrollPercent,
        Math.max(0, Math.min(100, percent)),
      );
    };

    const onVisibilityChange = () => {
      const page = pageRef.current;
      if (!page) return;
      const timestamp = performance.now();
      if (document.visibilityState === "hidden") {
        if (page.activeStartedAt !== null) {
          page.activeMs += timestamp - page.activeStartedAt;
          page.activeStartedAt = null;
        }
      } else if (page.activeStartedAt === null) {
        page.activeStartedAt = timestamp;
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const applicationLink = target.closest<HTMLElement>("[data-apply-click-source]");
      if (applicationLink?.dataset.applyClickSource) {
        const payload = JSON.stringify({ source: applicationLink.dataset.applyClickSource });
        if (!navigator.sendBeacon?.("/api/apply-click", new Blob([payload], { type: "application/json" }))) {
          void fetch("/api/apply-click", {
            method: "POST",
            body: payload,
            headers: { "content-type": "application/json" },
            credentials: "same-origin",
            keepalive: true,
          }).catch(() => {});
        }
      }
      const tracked = target.closest<HTMLElement>("[data-analytics-event]");
      if (!tracked) return;
      postEvent({
        eventType: "interaction",
        visitorId: vid,
        sessionId: sid,
        path: pathname,
        interactionName: tracked.dataset.analyticsEvent || "interaction",
        interactionLabel: tracked.dataset.analyticsLabel || null,
      });
    };

    const observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (!entry.isIntersecting || entry.intersectionRatio < 0.5)
                  continue;
                const element = entry.target as HTMLElement;
                const name = element.dataset.analyticsImpression;
                if (!name) continue;
                const key = `${pathname}:${name}`;
                if (seenImpressionsRef.current.has(key)) continue;
                seenImpressionsRef.current.add(key);
                postEvent({
                  eventType: "cta_impression",
                  visitorId: vid,
                  sessionId: sid,
                  path: pathname,
                  interactionName: name,
                  interactionLabel: element.dataset.analyticsLabel || null,
                });
                observer?.unobserve(element);
              }
            },
            { threshold: 0.5 },
          )
        : null;

    document
      .querySelectorAll<HTMLElement>("[data-analytics-impression]")
      .forEach((element) => observer?.observe(element));
    updateScroll();

    window.addEventListener("scroll", updateScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("click", onClick, true);
    const onPageHide = () => finishPage(true);
    window.addEventListener("pagehide", onPageHide, { once: true });

    return () => {
      finishPage(true);
      window.removeEventListener("scroll", updateScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pagehide", onPageHide);
      observer?.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    if (visitorIdRef.current === null) {
      visitorIdRef.current = visitorId();
    }
    if (sessionIdRef.current === null) {
      sessionIdRef.current = sessionId();
    }
    const vid = visitorIdRef.current;
    const sid = sessionIdRef.current;
    if (!vid || !sid || window.location.hostname !== "suasstem.org") return;

    const onError = (event: ErrorEvent) => {
      if (errorCountRef.current >= 5) return;
      errorCountRef.current += 1;
      let source: string | null = null;
      if (event.filename) {
        try {
          const url = new URL(event.filename, window.location.origin);
          if (url.origin === window.location.origin) source = url.pathname;
        } catch {
          source = null;
        }
      }
      postEvent({
        eventType: "client_error",
        visitorId: vid,
        sessionId: sid,
        path: window.location.pathname,
        errorMessage: event.message || "JavaScript error",
        errorSource: source,
        errorLine: event.lineno || null,
        errorColumn: event.colno || null,
      });
    };

    const onUnhandledRejection = () => {
      if (errorCountRef.current >= 5) return;
      errorCountRef.current += 1;
      postEvent({
        eventType: "client_error",
        visitorId: vid,
        sessionId: sid,
        path: window.location.pathname,
        errorMessage: "Unhandled promise rejection",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
