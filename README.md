# Fresh API Tester

Das **Fresh API Tester**-Projekt ist ein Tool, das API-Endpunkte validiert und
deren Antwortstruktur überprüft. Es nutzt Deno, um API-Anfragen zu stellen,
Antworten mit vordefinierten Strukturen zu vergleichen und die Ergebnisse zu
speichern und zu berichten. Bei Bedarf können Slack-Benachrichtigungen mit
Buttons zum Genehmigen von Änderungen an der Antwortstruktur gesendet werden.

## Funktionsübersicht

- **API-Tests**: Führt API-Tests auf Endpunkten durch, vergleicht die
  Antwortstrukturen und speichert die Ergebnisse.
- **Datenbank-Integration (Deno KV)**: Speichert und verwaltet genehmigte
  Änderungen an den API-Antwortstrukturen.
- **Slack-Benachrichtigungen**: Sendet Benachrichtigungen an Slack mit den
  Testergebnissen, inklusive Buttons für die Genehmigung von Strukturänderungen.
- **PIN-basierte Verifizierung**: Änderungen müssen über Slack per PIN bestätigt
  werden, bevor sie übernommen werden.

## Installationsanleitung

### Voraussetzungen

- [Deno](https://deno.land/) installiert (Version `1.18` oder höher).
- Eine Slack-App für Benachrichtigungen (mit `SLACK_BOT_TOKEN`,
  `SLACK_CHANNEL_ID` und `SLACK_SIGNING_SECRET`).

### 1. Deno installieren

Falls Deno noch nicht installiert ist, kann es (https://deno.land/#installation)
heruntergeladen oder mit:

curl -fsSL https://deno.land/x/install/install.sh | sh

installiert werden.

## Umgebungsvariablen einrichten

Folgende Umgebungsvariablen müssen gesetzt werden:

export SLACK_BOT_TOKEN_1=<DEIN_BOT_TOKEN> export
SLACK_CHANNEL_ID_1=<DEIN_SLACK_CHANNEL_ID> export
SLACK_SIGNING_SECRET_1=<DEIN_SLACK_SIGNING_SECRET> export
SLACK_APPROVE_PIN=<DEINE_PIN> # Standard-PIN für Genehmigungen export
GITHUB_OWNER=<DEIN_GITHUB_OWNER> export GITHUB_REPO=<DEIN_GITHUB_REPO> export
GITHUB_BRANCH=<ZWEIGNAME> # (optional; Standard: main)

## Deno-Module cachen

deno cache --unstable src/api-tester/core/*.ts

## Testausführung

Einen einzelnen API-Test führst du so aus:

bash: deno run --unstable-kv -A run-test-single.ts "Get View Product"

Für einen Batch-Durchlauf aller Endpunkte:

bash: deno run --unstable --unstable-kv -A run-tests.ts

Falls du nur Dry-Run möchtest (kein Git-Push, keine echten Slack-Posts):

Setze DRY_RUN=true und/oder LOCAL_MODE=true in der Umgebung.

# Projektstruktur

api-tester-fresh/ ├── README.md # Diese Datei ├── deno.json # Deno-Konfiguration
├── run-test-single.ts # Skript für Einzeltests ├── run-tests.ts # Skript für
Batch-Tests ├── src/ │ ├── api-tester/ │ │ ├── core/ │ │ │ ├── apiCaller.ts #
API-Request- und Vergleichslogik │ │ │ ├── configLoader.ts # Lädt config.json │
│ │ ├── kv.ts # Deno KV-Integration │ │ │ ├── compareStructures.ts # Vergleicht
zwei JSON-Schemata │ │ │ ├── structureAnalyzer.ts # Analysiert und speichert
Strukturen │ │ │ ├── versionChecker.ts # Prüft auf neue API-Versionen │ │ │ ├──
gitPush.ts # Push neuer Schemata nach GitHub │ │ │ ├── slack/ │ │ │ │ ├──
sendSlackReport.ts # Sendet Testbericht an Slack │ │ │ │ ├──
handlePinSubmission.ts # Verarbeitet Slack-PIN-Submission │ │ │ │ ├──
openPinModal.ts # Öffnet PIN-Modal in Slack │ │ │ │ ├── slackWorkspaces.ts #
Liest Slack-Konfiguration │ │ │ │ ├── validateSignature.ts # Prüft
Slack-Signatur │ │ │ │ └── debugStore.ts # Speichert Debug-Events in Memory │ │
│ ├── utils.ts # Hilfsfunktionen (Pfad, Ersetzungen) │ │ │ └── types.ts #
Gemeinsame Typdefinitionen │ │ └── default-ids.json # Standard-IDs für Endpunkte
│ ├── main.ts # Einstiegspunkt für Fresh-Server (optional) │ └── routes/ #
Fresh-Routen (Slack, KV-Dump, etc.) ├── .gitignore # Git-Ignore-Datei └──
config.json # Konfigurationsdatei für API-Endpunkte

# Erläuterung wichtiger Dateien

## apiCaller.ts

Sendet HTTP-Anfragen an die konfigurierten Endpunkte, liest den JSON-Body,
vergleicht die Antwort mit dem erwarteten Schema und erstellt ein TestResult.

## configLoader.ts

Lädt config.json aus einem der vordefinierten Pfade oder aus CONFIG_PATH.
Validiert, dass endpoints ein nicht-leeres Array ist, und liest optional gitRepo
oder Umgebungsvariablen GITHUB_OWNER/GITHUB_REPO/GITHUB_BRANCH.

## kv.ts

Initialisiert eine Deno KV-Instanz. In Deno Deploy wird globalThis.KV genutzt.
Lokal mit --unstable-kv wird Deno.openKv() verwendet. Für CI oder SKIP_KV=true
existiert ein In-Memory-Stub, der get, set, delete, list, getMany usw. als
vereinfachte Methoden bereitstellt.

## compareStructures.ts

Vergleicht zwei JSON-Schemata (erwartet vs. aktuell). Findet fehlende,
zusätzliche Felder sowie Typabweichungen und gibt ein CompareResult zurück.

## structureAnalyzer.ts

Lädt das erwartete Schema entweder aus KV (["expected", key]) oder aus der
Datei. Führt compareStructures aus, speichert bei Abweichungen das neue Schema
in KV unter ["schema-update-pending", key]. Falls nur Typabweichungen vorliegen,
wird das neue Schema direkt in der Datei bzw. als KV-Ersatz gespeichert.

## versionChecker.ts

Prüft, ob die URL des Endpunkts eine Versionsnummer (/v1/, /v2/ etc.) enthält,
versuch, /v(next)/ zu erreichen. Wenn HTTP 200 mit einer validen Antwort, wird
versionChanged=true zurückgegeben und der Aufrufer startet keinen weiteren Test.

## gitPush.ts

Nimmt ein oder mehrere SchemaUpdate-Objekte, generiert einen Stub (alle Strings
= "string", Zahlen = 0, Booleans = false, null bleibt null, Array nur erstes
Element), und pusht sie mit @octokit/rest in das GitHub-Repository. Aktualisiert
anschließend src/api-tester/config.json, um expectedStructure auf den neuen Pfad
zu setzen.

## slack/sendSlackReport.ts

Erzeugt Slack Block-Kit-Blöcke für Header, neue Versionen, Body (Issues) und
Statistik. Wandelt jede Ziffer in Keycap-Emoji um (z. B. 16 → 1️⃣6️⃣). Speichert
für jede offene Issue die rohen Blöcke in KV unter ["rawBlocks", key], damit
später die Buttons entfernt werden können. Versendet paginierte Nachrichten mit
chat.postMessage an alle konfigurierten Workspaces.

## slack/openPinModal.ts

Öffnet ein Slack-Modal, in dem der User einen PIN eingibt, um die Genehmigung
der Strukturänderung zu bestätigen. Das Modal enthält im private_metadata alle
Daten zum Endpoint (Name, Methode, fehlende/zusätzliche Felder, Typabweichungen,
ts, channel).

## slack/handlePinSubmission.ts

Verarbeitet das view_submission-Event von Slack. Liest den PIN, validiert gegen
SLACK_APPROVE_PIN, speichert "approved" in KV unter ["approvals"][key], liest
aus KV unter ["pendingUpdates"] das passende SchemaUpdate, pusht das Schema mit
gitPush, entfernt diesen Eintrag aus ["pendingUpdates"], aktualisiert die
ursprüngliche Slack-Nachricht (entfernt Buttons, hängt „AKTUALISIERT • <Zeit>“
und „✅ Freigegeben durch <user>“ an), schreibt die neuen Blöcke zurück in
["rawBlocks", key], und startet run-tests.ts erneut.

## slack/slackWorkspaces.ts

Liest Umgebungsvariablen SLACK_BOT_TOKEN_1, SLACK_CHANNEL_ID_1,
SLACK_SIGNING_SECRET_1, SLACK_BOT_TOKEN_2, … und liefert ein Array von Objekten
{ token, channel, signingSecret }.

## slack/validateSignature.ts

Prüft, ob eine eingehende Slack-Request gültig ist: Liest x-slack-signature und
x-slack-request-timestamp, erstellt das HMAC-SHA256-Signaturziel und vergleicht
es constant-time mit dem Header-Wert.

## slack/debugStore.ts

Speichert bis zu 20 Slack-Events im Memory-Array slackDebugEvents, um sie später
über einen Endpunkt (z. B. kv-dump) anzusehen.

## utils.ts

resolveProjectPath(...): Löst Pfade relativ zum Projekt-Root (Deno.cwd()).

replaceWithFallback(value, fallback): Gibt fallback zurück, wenn value
null/undefined ist.

safeReplace(template, replacements): Ersetzt ${KEY} in Strings durch Werte aus
replacements.

## types.ts

Gemeinsame Typen:

export type Schema = Record<string, unknown>;

export interface TypeMismatch { path: string; expected: string; actual: string;
}

export interface Diff { missingFields: string[]; extraFields: string[];
typeMismatches: TypeMismatch[]; updatedSchema: Schema; }

## run-test-single.ts

Skript für Einzeltest:

1. Lädt config.json

2. Findet den angegebenen Endpoint

3. Führt runSingleEndpoint(...) aus

4. Gibt HTTP-Status, Strukturvergleich, erwartetes und tatsächliches JSON in der
   Konsole aus

5. Sendet einen einzelnen Slack-Report (sofern DISABLE_SLACK ≠ "true").

## run-tests.ts

Batch-Skript:

1. Lädt config.json

2. Iteriert über alle konfigurierten Endpunkte und ruft runSingleEndpoint(...)
   auf

3. Sammelt alle TestResult und VersionUpdate

4. Sendet einen Slack-Report (mit aufgelisteten offenen Issues) oder leitet zu
   Dry-Run/DISABLE_SLACK um

5. Pusht alle SchemaUpdates ins GitHub-Repo bei Bedarf

6. Bereinigt KV-Einträge:

- Entfernt freigegebene rawBlocks

- Setzt ["approvals"][key] = "approved"

- Aktualisiert ["pending"] bzw. ["schema-update-pending"]

## main.ts

Einstiegspunkt für Fresh (falls das Projekt als Web-App dient). Kann Cron-Jobs
anlegen, um run-tests.ts periodisch auszuführen, oder Endpunkte für manuelle
Ausführung bereitstellen.

## routes/api/... (Fresh-Routen)

actions.ts: Verarbeitet Slack-Interaktionen auf HTTP-Ebene (Signatur-Check,
Button-Clicks, View-Submissions).

cron-log.ts: Gibt den Zeitstempel des letzten Cron-Laufs zurück.

kv-dump.ts: Listet aktuelle KV-Einträge (approvals, rawBlocks,
schema-update-pending, expected) zur Debug-Ausgabe.

reset-approvals.ts: Löscht ["approvals"].

reset-expected.ts: Löscht ["expected", key] in KV (nur ein Eintrag).

reset-pending.ts: Löscht ["pending"] sowie alle Einträge unter
["schema-update-pending"].

run-tests.ts: Löst runTests per HTTP-Aufruf aus.

slack.ts: Hört auf Slack-Events:

1. Verifiziert Signatur (validateSignature)

2. Bei url_verification antwortet mit challenge

3. Bei view_submission ruft handlePinSubmission auf

4. Bei block_actions ruft openPinModal auf

# Funktionen und Arbeitsweise

API-Testdurchführung

runSingleEndpoint sendet die HTTP-Anfrage, liest die Antwort als Text, parst
JSON oder behält Text bei, vergleicht mit dem erwarteten Schema, korreliert
missingFields, extraFields, typeMismatches und generiert ggf. neue
Schema-Entwürfe (SchemaUpdate).

Speichern von Abweichungen

structureAnalyzer.analyzeResponse lädt das vorhandene Schema
(loadExpectedSchema), transformiert den Response mit transformValues, vergleicht
Strukturen, schreibt bei Abweichungen ["schema-update-pending", key] =
actualSchema in KV.

Nur Typabweichungen ohne fehlende/zusätzliche Felder werden direkt per
saveUpdatedSchema in Datei bzw. KV aktualisiert.

Slack-Benachrichtigung

sendSlackReport baut aus allen TestResult und VersionUpdate eine Slack-Message:

Header (renderHeaderBlock)

(falls vorhanden) Version-Abschnitt (renderVersionBlocks)

Jeder offene Issue als seitenweise paginierte Blöcke:

Section mit Keycap-Emoji + EndpointName + Icon

Kontext-Blöcke für Fehlende/Neue Felder und Typabweichungen

Action-Block mit Buttons ✅ Einverstanden (value = JSON mit allen Details) und
⏸️ Warten (value = key)

Divider

Speichert dazu alle rohen Blöcke in ["rawBlocks", key], damit
handlePinSubmission sie später bearbeiten kann.

Genehmigung über Slack

Klick auf ✅ Einverstanden öffnet ein Modal (openPinModal) mit private_metadata
= JSON-Bahn aller Details + ts + channel.

In handlePinSubmission:

PIN einlesen, prüfen gegen SLACK_APPROVE_PIN

In KV ["approvals"][key] = "approved" speichern

Aus ["pendingUpdates"] den passenden SchemaUpdate holen, ins Git pushen (via
pushExpectedSchemaToGit), ["pendingUpdates"] bereinigen

Original-Slack Nachricht updaten:

["rawBlocks", key] abrufen

Buttons (block_id="decision_buttons_<key>") entfernen

Neuen Divider verwerfen, falls vorhanden

Abschnitt „AKTUALISIERT • <Zeit>“ + Detail-Infos der Abweichungen + „✅
Freigegeben durch <userName>“ anhängen

chat.update an Slack senden

["rawBlocks", key] = updatedBlocks speichern

run-tests.ts erneut starten (mit Deno.Command), um alle Tests jetzt mit
genehmigten Schemas neu auszuführen.

Datenmanagement mit Deno KV

["approvals"]: Record<key, "approved" | "waiting">

["rawBlocks", key]: Array<SlackBlock> (unveränderte Blöcke der ursprünglichen Report-Nachricht)
["schema-update-pending", key]: Schema (wenn fehlende/zusätzliche Felder existierten)
["pendingUpdates"]: Array<SchemaUpdate> (gesammelte Entwürfe, die gepusht werden sollen)

["expected", key]: Schema, falls Datei nicht verfügbar oder KV als Fallback

Cron-Jobs / Automatisierung

In main.ts (Fresh-Server) kann ein Cron-Job wie Deno.cron("run-tests-every-12h",
"0 */12 * * *", runAllTests) angelegt werden, um halb­täglich Tests auszuführen.

Alternativ per HTTP über routes/api/run-tests.ts manuell triggern.

Rücksetzer-Routen

reset-approvals: Löscht ["approvals"] (setzt alle Genehmigungen zurück).

reset-pending: Löscht ["pending"] und alle Einträge unter
["schema-update-pending"].

reset-expected: Löscht gezielt ["expected", key].

kv-dump: Gibt aktuellen Inhalt von approvals, rawBlocks, pending, expected als
JSON zurück (nur zu Debug-Zwecken).

Ablauf eines typischen Tests Batch-Durchlauf (runTests)

Lädt config.json.

Für jeden Endpoint:

runSingleEndpoint (Versionserkennung; wenn neue Version → pushen & überspringen;
sonst)

testEndpoint in apiCaller.ts (HTTP-Request → JSON-Parsing → Schema-Vergleich).

Bei Abweichungen: neue Entwürfe in schemaUpdates und
["schema-update-pending", key] = actualSchema in KV.

Alle TestResult und VersionUpdate sammeln.

sendSlackReport für offene Issues:

pendingIssues = allIssues.filter(approvals[key] ∈ {undefined, "pending"})

Blöcke bauen, Buttons mit JSON-Payload, rawBlocks in KV speichern, Chat-Post.

Falls schemaUpdates.length > 0:

pushExpectedSchemaToGit für alle Entwürfe (Stubify + GitHub → Commit).

["pendingUpdates"] aktualisieren (nur unbestätigte belassen).

In ["approvals", key] = "approved", ["rawBlocks", key] löschen.

Slack-Interaktion

User klickt „Einverstanden“ → openPinModal öffnet Modal mit Details im
private_metadata.

User gibt PIN ein → handlePinSubmission: PIN prüfen → KV ["approvals"][key] =
"approved" → passenden SchemaUpdate aus ["pendingUpdates"] holen →
pushExpectedSchemaToGit → ["pendingUpdates"] bereinigen → Slack-Nachricht
updaten (Buttons entfernen, „Freigegeben“ anhängen) → run-tests.ts neu starten.

Genehmigte Änderungen

Nach Genehmigung schreibt pushExpectedSchemaToGit den Stub ins GitHub-Repo
(expected/<endpoint>_vN.json)

config.json wird aktualisiert, damit expectedStructure auf das neue JSON zeigt.

Beim nächsten Durchlauf wird die neue Datei als Referenz genutzt.

Feedbek und Fehlersuche

kv-dump zeigt aktuellen KV-Inhalt (Approvals, rawBlocks, pending, expected) an.

slackDebugEvents speichert letzte Events, abrufbar für Diagnosen.

reset-*-Routen erlauben manuelles Zurücksetzen von KV-Einträgen.
