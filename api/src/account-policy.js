const ACCOUNT_STATES = new Set(['pending', 'active', 'suspended', 'cancelled']);
const HOSTING_MODELS = new Set(['hosted', 'self-hosted', 'managed', 'enterprise']);

function boundedInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

export function normalizeDomainName(value = '') {
  const domain = String(value).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[\/:].*$/, '').replace(/^\.+|\.+$/g, '');
  if (!domain || domain.length > 253 || !domain.includes('.')) return '';
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain)) return '';
  return domain;
}

function normalizeDomainList(value) {
  const items = Array.isArray(value) ? value : String(value || '').split(/[\r\n,;]+/);
  return [...new Set(items.map(normalizeDomainName).filter(Boolean))].slice(0, 250);
}

function normalizeEmailDomainList(value) {
  const items = Array.isArray(value) ? value : String(value || '').split(/[\r\n,;]+/);
  return [...new Set(items.map((item) => normalizeDomainName(String(item).replace(/^@/, ''))).filter(Boolean))].slice(0, 250);
}

export function normalizeHostingEntitlement(value = {}, { enterprise = false } = {}) {
  const status = ACCOUNT_STATES.has(value.status) ? value.status : 'pending';
  const model = HOSTING_MODELS.has(value.model) ? value.model : enterprise ? 'enterprise' : 'hosted';
  const unlimited = enterprise || value.unlimited === true;
  const ownedDomains = normalizeDomainList(value.ownedDomains);
  const allowedEmailDomains = normalizeEmailDomainList(value.allowedEmailDomains);
  return {
    status,
    model,
    unlimited,
    installationLimit: unlimited ? null : boundedInteger(value.installationLimit, 0, 10, 1),
    domainLimit: unlimited ? null : boundedInteger(value.domainLimit, 0, 250, 0),
    subdomainsPerDomain: unlimited ? null : boundedInteger(value.subdomainsPerDomain, 0, 250, 0),
    ownedDomains,
    allowedEmailDomains: allowedEmailDomains.length ? allowedEmailDomains : [...ownedDomains],
    allowRootDomains: unlimited ? value.allowRootDomains !== false : value.allowRootDomains === true,
    dnsAutomation: value.dnsAutomation === true,
    dnsChangeHoldDays: unlimited ? boundedInteger(value.dnsChangeHoldDays, 0, 365, 0) : boundedInteger(value.dnsChangeHoldDays, 0, 365, 3),
    whmcsServiceId: String(value.whmcsServiceId || '').replace(/[^0-9]/g, '').slice(0, 20),
    licenseKeySuffix: String(value.licenseKeySuffix || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(-12),
    updatedAt: String(value.updatedAt || '')
  };
}

export function ownedBaseDomain(hostname, entitlement) {
  const host = normalizeDomainName(hostname);
  if (!host) return '';
  const matches = (entitlement?.ownedDomains || []).filter((domain) => host === domain || host.endsWith(`.${domain}`));
  return matches.sort((a, b) => b.length - a.length)[0] || '';
}

export function isEmailAllowed(email, entitlement) {
  const candidate = String(email || '').trim().toLowerCase();
  if (!candidate) return true;
  const at = candidate.lastIndexOf('@');
  if (at <= 0) return false;
  const domain = normalizeDomainName(candidate.slice(at + 1));
  const allowed = entitlement?.allowedEmailDomains || [];
  if (!allowed.length) return true;
  return allowed.some((base) => domain === base || domain.endsWith(`.${base}`));
}

export function evaluateDomainClaim({ hostname, entitlement, existingHostnames = [], rootDomainEmptyConfirmed = false }) {
  const host = normalizeDomainName(hostname);
  if (!host) return { ok: false, code: 'invalid_domain', message: 'Enter a complete domain name.' };
  if (entitlement.status !== 'active') return { ok: false, code: 'account_inactive', message: 'This account is not active for hosted domains.' };
  const baseDomain = ownedBaseDomain(host, entitlement);
  if (!baseDomain) return { ok: false, code: 'domain_not_owned', message: 'This hostname is not within a domain assigned to this account.' };
  if (!entitlement.unlimited && entitlement.domainLimit <= 0) return { ok: false, code: 'domain_limit_zero', message: 'This account plan does not currently include domains.' };
  if (!entitlement.unlimited && entitlement.ownedDomains.length > entitlement.domainLimit) return { ok: false, code: 'owned_domain_limit', message: 'The account has more assigned domains than its current plan permits.' };
  const uniqueHosts = [...new Set(existingHostnames.map(normalizeDomainName).filter(Boolean))];
  if (uniqueHosts.includes(host)) return { ok: true, existing: true, hostname: host, baseDomain, isRoot: host === baseDomain };
  const isRoot = host === baseDomain;
  if (isRoot && !entitlement.allowRootDomains) return { ok: false, code: 'root_domain_disabled', message: 'Root-domain streaming is not enabled for this account.' };
  if (isRoot && !rootDomainEmptyConfirmed) return { ok: false, code: 'root_domain_confirmation', message: 'Confirm that the root domain has no existing website before attaching it.' };
  const hostsForBase = uniqueHosts.filter((item) => item !== baseDomain && item.endsWith(`.${baseDomain}`));
  if (!isRoot && !entitlement.unlimited && hostsForBase.length >= entitlement.subdomainsPerDomain) return { ok: false, code: 'subdomain_limit', message: 'This domain has reached its stream-host limit.' };
  return { ok: true, existing: false, hostname: host, baseDomain, isRoot };
}
