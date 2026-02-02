<?php

$configPath = __DIR__ . '/../storage/config.json';
$config = [];
if (is_file($configPath)) {
    $raw = file_get_contents($configPath);
    $config = json_decode($raw, true) ?? [];
}
$siteName = $config['siteName'] ?? 'Projet E6 - Bassin Connecte';
$buildDate = date('Y-m-d');
?>
<!doctype html>
<html lang="fr" data-api-base="/api/v1" data-build="<?php echo htmlspecialchars($buildDate, ENT_QUOTES); ?>">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?php echo htmlspecialchars($siteName, ENT_QUOTES); ?></title>
  <meta name="description" content="Supervision web pour bassin aquacole connecte: mesures, alertes, commandes et historique." />
  <link rel="stylesheet" href="/assets/styles.css" />
</head>
<body>
  <div class="backdrop" aria-hidden="true"></div>
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark">E6</div>
      <div>
        <div class="brand-title">Projet E6</div>
        <div class="brand-subtitle">Bassin aquaculture connecte</div>
      </div>
    </div>
    <nav class="nav">
      <a href="#presentation">Presentation</a>
      <a href="#elements">Elements</a>
      <a href="#dashboard">Dashboard</a>
      <a href="#securite">Securite</a>
      <a href="#docs">Docs</a>
    </nav>
    <div class="auth-actions">
      <span class="auth-status" data-auth-status>Session: invit?</span>
      <button class="btn ghost" type="button" data-auth-open>Connexion</button>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="hero-content">
        <p class="eyebrow">RAS miniaturise + IoT</p>
        <h1>Supervision intelligente d'un bassin aquacole connecte.</h1>
        <p class="lead">Mesures temps reel, commandes locales, alertes et analyse historique pour un bassin pilote avec ESP32.</p>
        <div class="hero-actions">
          <button class="btn" type="button" data-scroll="dashboard">Voir le dashboard</button>
          <button class="btn outline" type="button" data-scroll="elements">Voir les modules</button>
        </div>
        <div class="hero-stats">
          <div class="stat-card">
            <div class="stat-value" data-metric="temperature">--</div>
            <div class="stat-label">Temperature (C)</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" data-metric="ph">--</div>
            <div class="stat-label">pH</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" data-metric="turbidity">--</div>
            <div class="stat-label">Turbidite (NTU)</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" data-metric="water_level">--</div>
            <div class="stat-label">Niveau d'eau (%)</div>
          </div>
        </div>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="card globe">
          <div class="glow"></div>
          <div class="globe-core"></div>
          <div class="globe-ring"></div>
          <div class="globe-ring ring-2"></div>
          <div class="globe-ring ring-3"></div>
          <div class="globe-info">
            <span>Connexion ESP32</span>
            <strong>Online</strong>
          </div>
        </div>
        <div class="card floating-card">
          <div class="card-title">Synthese capteurs</div>
          <ul>
            <li>DS18B20 temperature</li>
            <li>pH analogique</li>
            <li>Turbidite optique</li>
            <li>Niveau d'eau</li>
          </ul>
        </div>
      </div>
    </section>

    <section id="presentation" class="section reveal">
      <div class="section-header">
        <h2>Presentation</h2>
        <p>Le besoin exprime porte sur la mise en place d'un bassin d'aquaculture connecte, base sur un systeme RAS miniaturise.</p>
      </div>
      <div class="content-grid">
        <div class="content-card">
          <h3>Objectif principal</h3>
          <p>Mesurer en continu temperature, niveau d'eau, turbidite et pH, piloter les actionneurs (pompe, chauffage) et envoyer les donnees vers une plateforme numerique.</p>
        </div>
        <div class="content-card">
          <h3>Contexte pedagodique</h3>
          <p>Ce projet rapproche l'etudiant des environnements supervises, de l'industrie 4.0, de la domotique et de la pisciculture intelligente.</p>
        </div>
        <div class="content-card">
          <h3>Livrables attendus</h3>
          <p>Tableau de bord web, API REST, historique des mesures, journalisation des commandes et documentation technique.</p>
        </div>
      </div>
    </section>

    <section id="elements" class="section reveal">
      <div class="section-header">
        <h2>Elements</h2>
        <p>Vision complete du systeme embarque, reseau, serveur et supervision.</p>
      </div>
      <div class="modules">
        <article class="module-card">
          <h3>A. ESP32 / Embarque</h3>
          <ul>
            <li>Programmation Arduino / ESP32.</li>
            <li>Lecture capteurs: DS18B20, pH, niveau, turbidite.</li>
            <li>Controle actionneurs via relais.</li>
            <li>Logique automatique locale (seuils, declenchement).</li>
            <li>Envoi des donnees via Wi-Fi.</li>
          </ul>
        </article>
        <article class="module-card">
          <h3>B. Reseau / IoT</h3>
          <ul>
            <li>Serveur MQTT ou API HTTP/REST.</li>
            <li>Adressage IP fixe / DHCP.</li>
            <li>Securisation Wi-Fi (WPA2, VLAN IoT).</li>
            <li>Configuration pare-feu (ports MQTT/HTTP).</li>
            <li>Tests de charge et stabilite.</li>
          </ul>
        </article>
        <article class="module-card">
          <h3>C. Serveur / Stockage</h3>
          <ul>
            <li>Base de donnees (MongoDB / MySQL / InfluxDB).</li>
            <li>Enregistrement a frequence reguliere.</li>
            <li>Sauvegarde automatique.</li>
            <li>Analyse de tendances.</li>
          </ul>
        </article>
        <article class="module-card">
          <h3>D. Interface / Supervision</h3>
          <ul>
            <li>Interface web HTML/CSS/JS/PHP.</li>
            <li>Affichage temps reel et historique.</li>
            <li>Commandes pompe et chauffage.</li>
            <li>Alertes mail et notification web.</li>
          </ul>
        </article>
        <article class="module-card">
          <h3>E. Securite</h3>
          <ul>
            <li>Authentification pour l'acces.</li>
            <li>Securisation MQTT (password + ACL).</li>
            <li>Cloisonnement reseau.</li>
            <li>Journalisation des declenchements.</li>
            <li>Tests d'intrusion simples.</li>
          </ul>
        </article>
      </div>
    </section>

    <section id="use-cases" class="section reveal">
      <div class="section-header">
        <h2>Cas d'utilisation</h2>
        <p>Le technicien aquacole pilote le bassin a travers un seul point de controle.</p>
      </div>
      <div class="use-cases">
        <div class="use-main">
          <div class="use-avatar"></div>
          <div>
            <h3>Technicien aquacole</h3>
            <p>Authentification requise pour acceder aux mesures, commandes et alertes.</p>
          </div>
        </div>
        <div class="use-list">
          <div class="use-item">Surveiller les parametres du bassin</div>
          <div class="use-item">Consulter l'historique des mesures</div>
          <div class="use-item">Modifier consignes et seuils d'alarme</div>
          <div class="use-item">Commander manuellement la pompe</div>
          <div class="use-item">Commander manuellement le chauffage</div>
          <div class="use-item">Consulter les alertes et journaux</div>
        </div>
      </div>
    </section>

    <section id="resources" class="section reveal">
      <div class="section-header">
        <h2>Ressources</h2>
        <p>Materiel principal pour le prototype RAS connecte.</p>
      </div>
      <div class="resources-grid">
        <div class="resource-card">
          <h4>Carte ESP32</h4>
          <p>Microcontroleur Wi-Fi pour capteurs et actionneurs.</p>
        </div>
        <div class="resource-card">
          <h4>Capteurs</h4>
          <p>DS18B20, pH, turbidite, niveau d'eau.</p>
        </div>
        <div class="resource-card">
          <h4>Actionneurs</h4>
          <p>Pompe, chauffage, relais double.</p>
        </div>
        <div class="resource-card">
          <h4>Reseau</h4>
          <p>Wi-Fi / Ethernet, passerelle IoT.</p>
        </div>
        <div class="resource-card">
          <h4>Serveur</h4>
          <p>Infrastructure locale ou cloud pour API et stockage.</p>
        </div>
        <div class="resource-card">
          <h4>Bassin 80L</h4>
          <p>Tuyaux 12/16mm, filtres, accessoires.</p>
        </div>
      </div>
    </section>

    <section id="dashboard" class="section reveal">
      <div class="section-header">
        <h2>Dashboard</h2>
        <p>Supervision temps reel, commandes et alertes centralisees.</p>
      </div>
      <div class="dashboard-grid">
        <div class="panel metrics">
          <div class="panel-header">
            <h3>Mesures temps reel</h3>
            <span class="panel-sub" data-last-update>Derniere mise a jour: --</span>
          </div>
          <div class="metric-grid">
            <div class="metric-card">
              <div class="metric-label">Temperature</div>
              <div class="metric-value" data-metric="temperature">--</div>
              <div class="metric-unit">C</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">pH</div>
              <div class="metric-value" data-metric="ph">--</div>
              <div class="metric-unit">pH</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Turbidite</div>
              <div class="metric-value" data-metric="turbidity">--</div>
              <div class="metric-unit">NTU</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Niveau d'eau</div>
              <div class="metric-value" data-metric="water_level">--</div>
              <div class="metric-unit">%</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Humidite</div>
              <div class="metric-value" data-metric="humidity">--</div>
              <div class="metric-unit">%</div>
            </div>
          </div>
          <canvas id="trendChart" width="600" height="240" aria-label="Graphique tendance" role="img"></canvas>
        </div>

        <div class="panel controls">
          <div class="panel-header">
            <h3>Commandes actionneurs</h3>
            <span class="panel-sub">Mode auto ou manuel</span>
          </div>
          <div class="control-group" data-control="pump">
            <div>
              <h4>Pompe de recyclage</h4>
              <p>Etat: <strong data-actuator-state="pump">--</strong></p>
            </div>
            <div class="control-actions">
              <button class="btn small" data-toggle="pump">Basculer</button>
              <button class="btn ghost small" data-mode="pump">Mode auto</button>
            </div>
          </div>
          <div class="control-group" data-control="heater">
            <div>
              <h4>Chauffage</h4>
              <p>Etat: <strong data-actuator-state="heater">--</strong></p>
            </div>
            <div class="control-actions">
              <button class="btn small" data-toggle="heater">Basculer</button>
              <button class="btn ghost small" data-mode="heater">Mode auto</button>
            </div>
          </div>
          <div class="panel-footer">
            <span class="hint">Journalisation automatique des commandes.</span>
          </div>
        </div>

        <div class="panel thresholds">
          <div class="panel-header">
            <h3>Seuils & consignes</h3>
            <span class="panel-sub">Parametrage securise</span>
          </div>
          <form class="threshold-form" data-threshold-form>
            <div class="field">
              <label>Temperature (C)</label>
              <div class="field-row">
                <input type="number" step="0.1" name="temperature_min" placeholder="Min" />
                <input type="number" step="0.1" name="temperature_max" placeholder="Max" />
              </div>
            </div>
            <div class="field">
              <label>pH</label>
              <div class="field-row">
                <input type="number" step="0.01" name="ph_min" placeholder="Min" />
                <input type="number" step="0.01" name="ph_max" placeholder="Max" />
              </div>
            </div>
            <div class="field">
              <label>Turbidite (NTU)</label>
              <div class="field-row">
                <input type="number" step="0.1" name="turbidity_max" placeholder="Max" />
              </div>
            </div>
            <div class="field">
              <label>Niveau d'eau (%)</label>
              <div class="field-row">
                <input type="number" step="0.1" name="water_level_min" placeholder="Min" />
                <input type="number" step="0.1" name="water_level_max" placeholder="Max" />
              </div>
            </div>
            <div class="field">
              <label>Humidite (%)</label>
              <div class="field-row">
                <input type="number" step="0.1" name="humidity_min" placeholder="Min" />
                <input type="number" step="0.1" name="humidity_max" placeholder="Max" />
              </div>
            </div>
            <button class="btn" type="submit">Sauvegarder</button>
            <p class="form-hint" data-threshold-status>Connexion requise pour modifier.</p>
          </form>
        </div>

        <div class="panel alerts">
          <div class="panel-header">
            <h3>Alertes & notifications</h3>
            <span class="panel-sub">Web + email (simulation)</span>
          </div>
          <div class="alert-list" data-alert-list></div>
        </div>

        <div class="panel history">
          <div class="panel-header">
            <h3>Historique recent</h3>
            <span class="panel-sub">12 derniers echantillons</span>
          </div>
          <div class="history-table" data-history-table></div>
        </div>

        <div class="panel logs">
          <div class="panel-header">
            <h3>Journal actionneurs</h3>
            <span class="panel-sub">Trafic et operations</span>
          </div>
          <div class="log-list" data-log-list></div>
        </div>
      </div>
    </section>

    <section id="securite" class="section reveal">
      <div class="section-header">
        <h2>Securite</h2>
        <p>Protection de l'interface, du reseau IoT et des donnees.</p>
      </div>
      <div class="content-grid">
        <div class="content-card">
          <h3>Authentification</h3>
          <p>Acces par identifiants, sessions serveur et roles definis.</p>
        </div>
        <div class="content-card">
          <h3>Segmentation reseau</h3>
          <p>VLAN IoT, regles firewall et isolation des flux critiques.</p>
        </div>
        <div class="content-card">
          <h3>Tra?abilite</h3>
          <p>Journalisation des actions et detection des anomalies.</p>
        </div>
      </div>
    </section>

    <section id="docs" class="section reveal">
      <div class="section-header">
        <h2>Documentation</h2>
        <p>Guides d'installation, API et notices utilisateur.</p>
      </div>
      <div class="docs-grid">
        <div class="doc-card">
          <h3>Guide installation</h3>
          <p>Serveur PHP, configuration locale et lancement.</p>
          <code>php -S localhost:3000 router.php</code>
        </div>
        <div class="doc-card">
          <h3>API REST</h3>
          <p>Endpoints /api/v1 pour mesures, seuils, actionneurs et alertes.</p>
        </div>
        <div class="doc-card">
          <h3>Maintenance</h3>
          <p>Sauvegarde des donnees JSON, export CSV, logs des actions.</p>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div>
      <strong><?php echo htmlspecialchars($siteName, ENT_QUOTES); ?></strong>
      <p>Build <?php echo htmlspecialchars($buildDate, ENT_QUOTES); ?> | Dashboard demo</p>
    </div>
    <div class="footer-links">
      <span>HTML / CSS / JS / PHP</span>
      <span>ESP32 + IoT</span>
    </div>
  </footer>

  <div class="auth-modal" data-auth-modal>
    <div class="auth-card">
      <div class="auth-header">
        <h3>Connexion technicien</h3>
        <button class="btn icon" type="button" data-auth-close>?</button>
      </div>
      <form class="auth-form" data-auth-form>
        <label>
          Identifiant
          <input type="text" name="username" placeholder="admin" required />
        </label>
        <label>
          Mot de passe
          <input type="password" name="password" placeholder="E6-2026" required />
        </label>
        <button class="btn" type="submit">Se connecter</button>
        <p class="auth-hint">Acces requis pour commandes et seuils.</p>
      </form>
      <div class="auth-footer">
        <button class="btn ghost" type="button" data-auth-logout>Se deconnecter</button>
      </div>
    </div>
  </div>

  <script src="/assets/app.js" defer></script>
</body>
</html>
