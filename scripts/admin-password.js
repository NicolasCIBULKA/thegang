// Génère l'empreinte du mot de passe administrateur, à copier dans la variable ADMIN_PASSWORD_HASH.
// Usage : npm run admin:password -- 'mon mot de passe'
import { hashPassword } from '../server/admin.js';

const password = process.argv[2];
if (!password) {
  console.error("Usage : npm run admin:password -- 'mon mot de passe'");
  process.exit(1);
}
console.log(hashPassword(password));
