# ngrok local (demo)

Cette variante publie ton projet depuis ton Mac avec **ngrok** sans nom de domaine personnel.

Elle est adaptee a ton projet car :

- le dashboard reste servi par Node.js
- l'application reste locale sur ton Mac
- l'ESP32 peut utiliser le firmware HTTP
- le plan gratuit ngrok fournit un domaine de developpement assigne automatiquement

## Important

- Le plan gratuit ngrok affiche une page d'avertissement devant le trafic HTML du navigateur. Il faut cliquer une fois sur `Visit`.
- D'apres la doc ngrok, cela n'affecte pas les acces API programmatiques.

## 1. Recuperer l'authtoken ngrok

Ton authtoken est disponible ici :

- `https://dashboard.ngrok.com/get-started/your-authtoken`

## 2. Preparer l'environnement local

```bash
cp .env.ngrok.example .env.ngrok
```

Puis modifie :

```env
NGROK_AUTHTOKEN=ton_authtoken_ngrok
ADMIN_PASS=un-mot-de-passe-admin
TECH_PASS=un-mot-de-passe-tech
```

`PUBLIC_BASE_URL` peut rester en local au premier demarrage. Tu pourras le remplacer plus tard par l'URL publique ngrok si tu veux l'utiliser dans les notifications email.

## 3. Lancer d'abord le site en local

```bash
docker compose --env-file .env.ngrok -f docker-compose.ngrok.yml up -d --build
```

Verifier :

```bash
docker compose --env-file .env.ngrok -f docker-compose.ngrok.yml ps
curl -I http://localhost:3003
```

## 4. Publier avec ngrok

Une fois `NGROK_AUTHTOKEN` rempli, lance le tunnel :

```bash
docker compose --env-file .env.ngrok -f docker-compose.ngrok.yml --profile publish up -d
```

Verifier :

```bash
docker compose --env-file .env.ngrok -f docker-compose.ngrok.yml ps
docker compose --env-file .env.ngrok -f docker-compose.ngrok.yml logs -f ngrok
```

## 5. Recuperer l'URL publique

Tu peux la voir :

- dans les logs du conteneur `ngrok`
- ou via l'inspection locale :

```bash
curl http://localhost:4041/api/tunnels
```

Cherche `public_url`, par exemple :

```text
https://example-name.ngrok-free.app
```

## 6. URLs utiles

- preview locale : `http://localhost:3003`
- UI d'inspection ngrok : `http://localhost:4041` une fois le profil `publish` demarre
- URL publique : `https://...ngrok-free.app`

## 7. Firmware ESP32

Dans `firmware/esp32.ino`, renseigne :

- le Wi-Fi
- l'URL publique dans `API_BASE`

Exemple :

```cpp
const char* API_BASE = "https://example-name.ngrok-free.app/api/v1";
```

## 8. Arret

```bash
docker compose --env-file .env.ngrok -f docker-compose.ngrok.yml down
```
