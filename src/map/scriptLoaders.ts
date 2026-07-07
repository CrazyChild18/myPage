declare global {
  interface Window {
    google?: any;
    AMap?: any;
    _AMapSecurityConfig?: { securityJsCode?: string };
  }
}

let googleMapsPromise: Promise<any> | null = null;
let amapPromise: Promise<any> | null = null;

const loadScript = (id: string, src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${id}`)), { once: true });
      if (existing.dataset.loaded === 'true') resolve();
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${id}`));
    document.head.appendChild(script);
  });

export const loadGoogleMaps = (key: string) => {
  if (!key) return Promise.reject(new Error('未配置 Google Maps 浏览器 Key'));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (!googleMapsPromise) {
    const params = new URLSearchParams({
      key,
      language: 'zh-CN',
      region: 'US',
      v: 'weekly',
    });
    googleMapsPromise = loadScript('voyage-google-maps-js', `https://maps.googleapis.com/maps/api/js?${params.toString()}`)
      .then(() => window.google?.maps);
  }
  return googleMapsPromise;
};

export const loadAmap = (key: string, securityCode = '') => {
  if (!key) return Promise.reject(new Error('未配置高德地图浏览器 Key'));
  if (securityCode) window._AMapSecurityConfig = { securityJsCode: securityCode };
  if (window.AMap) return Promise.resolve(window.AMap);
  if (!amapPromise) {
    const params = new URLSearchParams({
      key,
      v: '2.0',
      plugins: 'AMap.Scale,AMap.ToolBar',
    });
    amapPromise = loadScript('voyage-amap-js', `https://webapi.amap.com/maps?${params.toString()}`)
      .then(() => window.AMap);
  }
  return amapPromise;
};
