# Fresh API Tester

Das **Fresh API Tester**-Projekt ist ein Testwerkzeug, das API-Endpunkte
validiert und deren Antwortstruktur überprüft. Es nutzt Deno, um API-Anfragen zu
stellen, die Antworten mit einer vordefinierten Struktur zu vergleichen und dann
die Ergebnisse zu speichern und zu berichten. Bei Bedarf können auch
Slack-Benachrichtigungen mit Buttons zum Genehmigen von Änderungen an der
Antwortstruktur gesendet werden.

## Funktionsübersicht

- **API Tests**: Führt API-Tests auf Endpunkten durch, vergleicht die
  Antwortstrukturen und speichert die Ergebnisse.
- **Datenbank-Integration (Deno KV)**: Speichert und verwaltet genehmigte
  Änderungen an der Struktur der API-Antworten.
- **Slack-Benachrichtigungen**: Sendet Benachrichtigungen an Slack mit den
  Testergebnissen, einschließlich der Möglichkeit, eine Änderung der Struktur zu
  genehmigen.
- **PIN-basierte Verifizierung**: Bevor Änderungen an der Struktur übernommen
  werden, müssen sie über Slack mit einer PIN verifiziert werden.

## Installationsanleitung

### Voraussetzungen

- [Deno](https://deno.land/) installiert (Version `1.18` oder höher).
- Eine Slack-App, um Benachrichtigungen zu senden (mit dem `SLACK_BOT_TOKEN`,
  `SLACK_CHANNEL_ID`, und `SLACK_SIGNING_SECRET`).

### 1. Deno installieren

Falls du Deno noch nicht installiert hast, kannst du es
[hier herunterladen](https://deno.land/#installation) oder es mit folgendem
Befehl installieren:

```bash
curl -fsSL https://deno.land/x/install/install.sh | sh
2. Umgebungsvariablen einrichten
Lege die folgenden Umgebungsvariablen fest:

bash
Kopieren
Bearbeiten
export SLACK_BOT_TOKEN_1=<DEIN_BOT_TOKEN>
export SLACK_CHANNEL_ID_1=<DEIN_SLACK_CHANNEL_ID>
export SLACK_SIGNING_SECRET_1=<DEIN_SLACK_SIGNING_SECRET>
export SLACK_APPROVE_PIN=<DEINE_PIN>  # Default-PIN für die Genehmigung
3. Deno-Module installieren und konfigurieren
Lade die benötigten Deno-Module herunter:

bash
Kopieren
Bearbeiten
deno cache --unstable src/api-tester/core/*.ts
4. Testausführung
Du kannst den API-Test ausführen, indem du folgenden Befehl verwendest:

bash
Kopieren
Bearbeiten
deno run --unstable-kv -A run-test-single.ts "Get View Product"
Struktur des Projekts
Das Projekt ist so aufgebaut, dass die API-Tests durchgeführt, die Ergebnisse gespeichert und die Benutzer in Slack benachrichtigt werden. Hier ist eine Übersicht der Projektstruktur:

plaintext
Kopieren
Bearbeiten
api-tester-fresh/
├── README.md                          # Diese Datei
├── deno.json                           # Konfigurationsdatei für Deno
├── src/
│   ├── api-tester/
│   │   ├── core/
│   │   │   ├── apiCaller.ts            # API-Test-Logik
│   │   │   ├── configLoader.ts         # Lädt die Konfigurationsdatei
│   │   │   ├── kv.ts                   # Deno KV Integration
│   │   │   ├── slack/
│   │   │   │   ├── handlePinSubmission.ts  # Verarbeitet die Slack-PIN-Verifizierung
│   │   │   │   ├── sendSlackReport.ts      # Sendet den Testbericht an Slack
│   │   │   │   └── slackWorkspaces.ts      # Handhabt die Konfiguration der Slack-Arbeitsbereiche
│   │   │   └── structureAnalyzer.ts      # Analysiert und speichert die Antwortstrukturen
│   │   ├── run-test-single.ts           # Einzeln durchgeführter API-Test
│   │   ├── run-tests.ts                # Batch-Verarbeitung aller API-Tests
│   └── main.ts                         # Einstiegspunkt für das API-Testsystem
├── .gitignore                          # Git-Ignore-Datei
└── config.json                         # Konfigurationsdatei für API-Endpunkte und erwartete Strukturen
Erklärung der Hauptdateien:
apiCaller.ts: Enthält die Logik zum Senden von API-Anfragen und zum Vergleichen der Antwortstruktur mit einer erwarteten Struktur.

configLoader.ts: Lädt die Konfiguration für die API-Endpunkte und die zugehörigen erwarteten Strukturen.

kv.ts: Speichert die Zustimmungen und die "rawBlocks"-Daten im Deno KV.

handlePinSubmission.ts: Verarbeitet die PIN-Eingabe von Slack-Nutzern und genehmigt Änderungen an der Antwortstruktur.

sendSlackReport.ts: Sendet den API-Testbericht an Slack und ermöglicht die Interaktion mit Slack-Buttons zur Bestätigung der Antwortstruktur.

slackWorkspaces.ts: Liest die konfigurierten Slack-Arbeitsbereiche aus und stellt die API für Slack zur Verfügung.

structureAnalyzer.ts: Analysiert und transformiert die API-Antworten, um sie mit der erwarteten Struktur zu vergleichen und aktualisierte Strukturen zu speichern.

run-test-single.ts: Führt einen einzelnen API-Test aus.

run-tests.ts: Führt mehrere API-Tests aus.

Funktionen und Arbeitsweise
API-Testdurchführung:

Das System führt API-Anfragen gemäß der Konfiguration aus.

Die Antworten werden mit der erwarteten Struktur verglichen, und alle Unterschiede werden erfasst (fehlende Felder, unerwartete Felder, Typabweichungen).

Speichern von Abweichungen:

Wenn Abweichungen festgestellt werden, wird die neue Struktur im Deno KV und lokal gespeichert.

Slack-Benachrichtigungen:

Die Ergebnisse werden über Slack an den konfigurierten Arbeitsbereich gesendet.

Slack-Nutzer müssen mit einem Button bestätigen, ob sie die Änderungen an der Struktur genehmigen.

Datenmanagement mit Deno KV:

Die Zustimmungen und Änderungen werden im Deno KV gespeichert, um eine dauerhafte Speicherung der Benutzereingaben zu ermöglichen.

PIN-Verifizierung:

Eine PIN muss in Slack eingegeben werden, um eine Änderung an der Struktur zu genehmigen.

Weitere Funktionen
Deno KV: Ermöglicht es, Daten wie Zustimmungen und rawBlocks sicher zu speichern.

Slack-Interaktivität: Bietet Buttons zur Interaktion mit den Nutzern, um die Strukturänderungen zu genehmigen oder abzulehnen.
```
