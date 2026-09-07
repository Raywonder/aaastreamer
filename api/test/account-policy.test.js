import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDomainClaim, isEmailAllowed, normalizeHostingEntitlement } from '../src/account-policy.js';

test('normal hosted accounts default to zero domain entitlement', () => {
  const entitlement = normalizeHostingEntitlement({ status: 'active' });
  assert.equal(entitlement.installationLimit, 1);
  assert.equal(entitlement.domainLimit, 0);
  assert.equal(entitlement.subdomainsPerDomain, 0);
});

test('tappedin hosted node enforces its per-domain stream-host limit', () => {
  const entitlement = normalizeHostingEntitlement({ status: 'active', model: 'hosted', domainLimit: 1, subdomainsPerDomain: 2, ownedDomains: ['tappedin.fm'] });
  assert.equal(evaluateDomainClaim({ hostname: 'live.tappedin.fm', entitlement }).ok, true);
  assert.equal(evaluateDomainClaim({ hostname: 'radio.tappedin.fm', entitlement, existingHostnames: ['live.tappedin.fm', 'events.tappedin.fm'] }).code, 'subdomain_limit');
});

test('enterprise root domains require an explicit empty-site confirmation', () => {
  const entitlement = normalizeHostingEntitlement({ status: 'active', ownedDomains: ['rweent.com'], allowRootDomains: true }, { enterprise: true });
  assert.equal(evaluateDomainClaim({ hostname: 'rweent.com', entitlement }).code, 'root_domain_confirmation');
  assert.equal(evaluateDomainClaim({ hostname: 'rweent.com', entitlement, rootDomainEmptyConfirmed: true }).ok, true);
});

test('account email policy accepts main and secondary owned domains', () => {
  const entitlement = normalizeHostingEntitlement({ status: 'active', allowedEmailDomains: ['rweent.com', 'raywonderis.me'] });
  assert.equal(isEmailAllowed('admin@rweent.com', entitlement), true);
  assert.equal(isEmailAllowed('alerts@mail.raywonderis.me', entitlement), true);
  assert.equal(isEmailAllowed('person@example.net', entitlement), false);
});
