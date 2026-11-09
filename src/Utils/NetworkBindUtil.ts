const IPV4_WILDCARD = "0.0.0.0";
const IPV6_WILDCARD = "::";

export class NetworkBindUtil {
  static buildUrlHost(host: string): string {
    return host.includes(":") ? `[${host}]` : host;
  }

  static buildProbeHost(bindHost: string): string {
    // Why: a server bound to every address is probed on the loopback address, which always reaches it inside the same host or container.
    const host = bindHost.trim().toLowerCase();
    if (host === IPV4_WILDCARD) {
      return NetworkBindUtil.buildUrlHost("127.0.0.1");
    }
    if (host === IPV6_WILDCARD) {
      return NetworkBindUtil.buildUrlHost("::1");
    }
    return NetworkBindUtil.buildUrlHost(host);
  }
}
