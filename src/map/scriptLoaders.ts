declare global {
  interface Window {
    google?: any;
    AMap?: any;
    _AMapSecurityConfig?: { securityJsCode?: string };
    gm_authFailure?: () => void;
    __voyageGoogleMapsReady?: () => void;
  }
}

let googleMapsPromise: Promise<any> | null = null;
let amapPromise: Promise<any> | null = null;

const loadScript = (id: string, src: string) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(`${id} 加载超时，请检查网络后重试`)), 15000);
    const resolveOnce = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    const rejectOnce = (error: Error) => {
      window.clearTimeout(timeout);
      reject(error);
    };
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', resolveOnce, { once: true });
      existing.addEventListener('error', () => rejectOnce(new Error(`Failed to load ${id}`)), { once: true });
      if (existing.dataset.loaded === 'true') resolveOnce();
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolveOnce();
    };
    script.onerror = () => rejectOnce(new Error(`Failed to load ${id}`));
    document.head.appendChild(script);
  });

export const loadGoogleMaps = (key: string) => {
  if (!key) return Promise.reject(new Error('未配置 Google Maps 浏览器 Key'));
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps.importLibrary?.('marker')).then(() => window.google?.maps);
  }
  if (!googleMapsPromise) {
    window.gm_authFailure = () => {
      window.dispatchEvent(new CustomEvent('voyage:google-map-auth-error'));
    };
    const params = new URLSearchParams({
      key,
      language: 'zh-CN',
      region: 'US',
      v: 'weekly',
      loading: 'async',
      callback: '__voyageGoogleMapsReady',
      libraries: 'marker',
    });
    googleMapsPromise = new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Google Maps SDK 初始化超时')), 15000);
      window.__voyageGoogleMapsReady = () => {
        window.clearTimeout(timeout);
        if (!window.google?.maps?.Map) {
          reject(new Error('Google Maps SDK 未正确初始化'));
          return;
        }
        Promise.resolve(window.google.maps.importLibrary?.('marker'))
          .then(() => resolve(window.google.maps))
          .catch(reject);
      };
      loadScript('voyage-google-maps-js', `https://maps.googleapis.com/maps/api/js?${params.toString()}`)
        .catch((error) => {
          window.clearTimeout(timeout);
          reject(error);
        });
    })
      .catch((error) => {
        googleMapsPromise = null;
        throw error;
      });
  }
  return googleMapsPromise;
};

export const resetGoogleMapsLoader = () => {
  googleMapsPromise = null;
  document.getElementById('voyage-google-maps-js')?.remove();
  delete window.google;
  delete window.__voyageGoogleMapsReady;
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
