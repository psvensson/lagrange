const fs = require('fs');
const file = 'src/admin/admin-control-snapshot.js';
let content = fs.readFileSync(file, 'utf8');

const replacement = `  async ensureMembershipPublicationObservation() {
    const membershipPublicationService =
      this.controlPlaneReadinessService?.membershipPublicationService || null;
    if (!membershipPublicationService ||
        typeof membershipPublicationService !== 'object') {
      return null;
    }

    let publicationRow = null;
    if (typeof membershipPublicationService.getLatestClusterPublication === 'function') {
      try {
        publicationRow =
          await membershipPublicationService.getLatestClusterPublication({
            timeoutMs: 2000,
          });
        return publicationRow;
      } catch (err) {
        // Ignore read failures during snapshot (e.g. SQL engine not ready)
      }
    }
    return null;
  }`;

content = content.replace(/  async ensureMembershipPublicationObservation\(\) \{[\s\S]*?(?=  \/\*\*|\n$|  async execute)/, replacement + '\n\n');
fs.writeFileSync(file, content);
