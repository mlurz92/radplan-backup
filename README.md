# RadPlan – Vollständige Anwendungs- und Algorithmusdokumentation

> Stand dieser Dokumentation: **Codebasis im Repository `/workspace/radplan` vom 31.03.2026**.
> Diese README beschreibt den **Ist-Zustand** der Anwendung umfassend (Architektur, Datenmodell, UI, Regeln, Algorithmus, Persistenz, Grenzen), **nicht** nur Änderungen gegenüber einer Vorversion.

---

## Inhaltsverzeichnis

1. [Zweck und Einsatzkontext](#1-zweck-und-einsatzkontext)
2. [Technischer Gesamtaufbau](#2-technischer-gesamtaufbau)
3. [Datenmodell, State-Management und Persistenz](#3-datenmodell-state-management-und-persistenz)
4. [Kalenderlogik, Datumsfunktionen und Feiertage](#4-kalenderlogik-datumsfunktionen-und-feiertage)
5. [UI-Architektur und Interaktionen](#5-ui-architektur-und-interaktionen)
6. [Planungsmodus (Draft/Undo/Redo/Übernahme)](#6-planungsmodus-draftundoredoübernahme)
7. [Automatischer Planer („Neural Scheduler“)](#7-automatischer-planer-neural-scheduler)
8. [Regelwerk im Detail: harte Ausschlüsse, weiche Kriterien, Sonderregeln](#8-regelwerk-im-detail-harte-ausschlüsse-weiche-kriterien-sonderregeln)
9. [Scoring-, Objective- und Qualitätsmetriken](#9-scoring--objective--und-qualitätsmetriken)
10. [Historische Daten, Fairness und Lastausgleich](#10-historische-daten-fairness-und-lastausgleich)
11. [Import/Export, Integritätsreparatur und API-Mock](#11-importexport-integritätsreparatur-und-api-mock)
12. [Visualisierung des Algorithmus (NeuralGraph)](#12-visualisierung-des-algorithmus-neuralgraph)
13. [Fachliche Codes, Rollen und Semantik](#13-fachliche-codes-rollen-und-semantik)
14. [Bedienung: Workflow-Empfehlung Schritt für Schritt](#14-bedienung-workflow-empfehlung-schritt-für-schritt)
15. [Grenzen, implizite Annahmen und bekannte Trade-offs](#15-grenzen-implizite-annahmen-und-bekannte-trade-offs)
16. [Datei- und Modulübersicht](#16-datei--und-modulübersicht)

---

## 1. Zweck und Einsatzkontext

RadPlan ist eine rein browserbasierte Planungsanwendung zur Erstellung, Prüfung und Optimierung von Monatsdienstplänen in einer radiologischen Umgebung.

Der funktionale Fokus liegt auf:

- Verteilung von **Bereitschaftsdienst (D)** und **Hintergrunddienst (HG)**,
- gleichzeitiger Verwaltung von Tageszuweisungen (Arbeitsplätze/Abwesenheiten),
- Einhaltung harter medizinisch-organisatorischer Regeln,
- reproduzierbarer, protokollierter Algorithmik mit erklärbaren Entscheidungen,
- Echtzeit-Auswertung und visuellem Feedback.

Die Anwendung ist so aufgebaut, dass sie ohne externes Backend lauffähig bleibt und Daten lokal verfügbar hält.

---

## 2. Technischer Gesamtaufbau

### 2.1 Laufzeitmodell

- Frontend-only Web-App mit ES-Modulen.
- Keine Framework-Pflicht (Vanilla JS + HTML + CSS).
- Offline-fähig durch lokale Persistenz und API-Mock für Save/Load.

### 2.2 Zentrale Module

- `js/constants.js`: Stammdaten, Code-Listen, Rollen-/Metadaten, Datumsfunktionen.
- `js/state.js`: Globaler App-State und Storage-Load/Save.
- `js/model.js`: Datenzugriff, Mutationen, Integritätsfunktionen, Kennzahlen.
- `js/render.js`: Rendering, responsive Verhalten, Modals, lokale API-Interception.
- `js/app.js`: Controller-Logik, Events, Periodenwechsel, Planmodus-Orchestrierung.
- `js/autoplan.js`: Automatischer Planer inkl. Regelwerk, Optimierung, Report, Qualitätsscore.
- `js/neuralgraph.js`: Visuelle Telemetrie/Animation des Algorithmus.

### 2.3 Progressive-Web-App-Baustein

- `manifest.json` enthält PWA-Metadaten/Icon-Definition.
- App bleibt als lokale Anwendung nutzbar.

---

## 3. Datenmodell, State-Management und Persistenz

### 3.1 Root-Datenstruktur (`DATA`)

Persistenzschlüssel: `radplan_v3`.

`DATA` ist monatsbasiert organisiert, Schlüsseltyp: `YYYY-MM` (Monat 0-basiert im Codekontext).

Pro Monat wird ein Knoten geführt:

- `employees: string[]`
- `assignments: { [empName]: { [day: number]: { assignment?: string, duty?: "D"|"HG" } } }`
- `rbn: { [day: number]: string }`
- `wishes` (optional je nach Monatssnapshot)

### 3.2 Semantik je Zelle

Eine Tageszelle kann gleichzeitig enthalten:

- `assignment` (z. B. `MR`, `CT`, `U`, `FZA` oder auch mehrfach per Slash wie `MR/US`),
- `duty` (`D` oder `HG`).

### 3.3 State-Felder (flüchtig, UI/Session)

In `state` werden u. a. geführt:

- aktive Periode (`year`, `month`),
- Editorstatus (`edit`, `ed`),
- Dashboard-Filter,
- period draft (`periodDraft`) für die Zeitraum-Auswahl,
- Profil-Modal-Zielperson,
- Responsive-Flags (`IS_MOBILE`).

### 3.4 Persistenzfluss

1. Laden versucht zunächst `/api?action=load`.
2. Bei Fehler/Fallback wird `localStorage` genutzt.
3. Speichern schreibt sofort lokal und triggert verzögert (`~800ms`) einen Save-POST an `/api?action=save`.
4. Plan-Entwürfe werden als `radplan_v3_plan_<YYYY-MM>` separat gehalten.

---

## 4. Kalenderlogik, Datumsfunktionen und Feiertage

### 4.1 Kalendermetadaten

- Monatslängen, Wochentage, KW, Monatsübergänge werden zentral berechnet.
- Feiertagslogik ist auf Sachsen ausgelegt (inkl. beweglicher Feiertage über Osterberechnung).

### 4.2 Wochenenddefinition (algorithmisch relevant)

- Für mehrere Fairness- und WE-Regeln werden **Fr/Sa/So** als Wochenendblock betrachtet.
- WE-Äquivalent pro KW: 
  - mindestens ein `D` -> `1.0`
  - sonst mindestens ein `HG` -> `0.5`

### 4.3 Tagesklassifikation

Der Algorithmus unterscheidet u. a.:

- Werktag,
- Wochenende,
- Feiertag,
- Tag vor Feiertag,
- Samstag als Sonderfall für Facharzt-BD-Regeln.

---

## 5. UI-Architektur und Interaktionen

### 5.1 Hauptansicht

- Desktop: Matrix (Mitarbeiter x Tage).
- Mobile: kartenbasierte Tagesdarstellung mit verdichteter Dienstsicht.

### 5.2 Periodensteuerung

- Monat/Jahr vor/zurück,
- Flyout mit Draft-Auswahl,
- Sprung auf „Heute“ inkl. Auto-Scroll.

### 5.3 Editieren

- Zell-Editor mit Workplace-/Status-/Duty-Auswahl,
- Konflikthinweise (abhängig von Regelwerk und bereits gesetzten Diensten).

### 5.4 Kontext- und Analysemodals

- Abteilungsansicht (Coverage/Lasten),
- Mitarbeiter-Dashboard,
- Profilansicht mit Monats-/Jahresmetriken,
- Score-Info-Dialog zur Qualitätsberechnung.

### 5.5 Responsives Verhalten

- Breakpoint-basiertes Umschalten,
- Modal-Höhenanpassung je Viewport,
- Debounced Reflow/Render-Pipeline.

---

## 6. Planungsmodus (Draft/Undo/Redo/Übernahme)

Planmodus trennt sichere Bearbeitung von produktiver Monatsansicht.

### 6.1 Eintritt

Beim Start des Planmodus werden Baseline und Arbeitskopie erzeugt.

### 6.2 Historie

- Jede relevante Mutation erzeugt einen Snapshot.
- `planHistory` + `planHistoryIdx` implementieren Undo/Redo.

### 6.3 Sessions

- Monatsspezifische Entwürfe können parallel gehalten werden.
- Beim Periodenwechsel im Planmodus wird die Session mitgeführt.

### 6.4 Übernahme oder Verwerfen

- Übernahme merged Draft in `DATA` und persistiert.
- Abbruch kehrt auf Baseline zurück.

### 6.5 Integritätsregel „Post-BD-Frei“

- Nach `D` wird automatisch ein Folgetag `F` gesetzt (sofern nicht belegt/gesperrt).
- Importierte Daten können über `ensurePostBDFreiDays()` repariert werden.

---

## 7. Automatischer Planer („Neural Scheduler“)

Der Planer ist keine Blackbox, sondern ein mehrstufiges deterministisch-stochastisches Verfahren mit klarer Zielhierarchie:

1. vollständige Tagesabdeckung (`D` + `HG`),
2. Einhaltung harter Regeln,
3. faire Lastverteilung,
4. Wunschberücksichtigung,
5. strukturelle Mustervermeidung.

### 7.1 Initialisierung

- Laden Monatskontext, Mitarbeiter, Feiertage, Wünsche.
- Erkennen bereits fixierter Dienste.
- Aufbau historischer Vergleichsdaten bis Vormonat.
- Initiale Zielwerte (`bdTarget`) pro Person.

### 7.2 Kandidatenräume

- `dutyEmps`: alle nicht dienstbefreiten Mitarbeitenden.
- `hgFAs`: facharztqualifizierte Kandidaten für HG.

### 7.3 Konstruktive Verteilung

1. Wochenend-/Feiertags-BD zuerst,
2. Werktags-BD danach,
3. deterministische HG-Bündelungen,
4. restliche HG-Lücken via Scoring.

### 7.4 Mehrzyklische Optimierung

Konfiguriert mit:

- 25 Zyklen,
- pro Zyklus BD-Pass (80), HG-Pass (120), Deep-Pass (150).

Dabei werden Dienste umgehängt/geswappt, wenn Objective sinkt.

### 7.5 Repair/Validierung

- Lückenreparatur bei Restunterdeckung,
- abschließende Qualitätszusammenfassung,
- Report/Telemetry/Warnings.

---

## 8. Regelwerk im Detail: harte Ausschlüsse, weiche Kriterien, Sonderregeln

## 8.1 Harte Ausschlüsse (Beispiele, nicht optional)

Ein Kandidat wird verworfen, wenn mindestens eine Bedingung verletzt ist:

- dienstbefreit (`DUTY_EXEMPT`, aktuell u. a. Prof. Schäfer),
- Abwesenheit am Tag (`U`, `ZU`, `SU`, `FZA`, `K`, `KK`, `§15c`, `WB`),
- bereits gesetzter Dienst am Tag,
- `NO_DUTY`-Wunsch,
- D am Vortag oder Folgetag (kein D-D),
- Urlaub am Folgetag (kein D direkt davor),
- CT-Leitungskonflikt Becker/Martin,
- Dalitz-Mammographie-Konflikt (So/Mo-Konstellationen),
- Feiertagsblock-Konflikte (Ostern/Pfingsten-Alternanz),
- HG-Qualifikation fehlt (HG nur Facharztgruppe),
- unzulässiges HG direkt vor eigenem D (Ausnahme Freitag-Konstellation),
- Samstag-BD nur für Facharztgruppe.

### 8.2 Weiche Kriterien (Rangordnung per Score)

Wenn mehrere gültige Kandidaten existieren, entscheidet gewichtetes Scoring, u. a. nach:

- Sollerfüllung pro Person,
- WE-Fairness,
- Wunschbonus (`BD_WISH`, `HG_WISH`),
- Abstand zu letzten gleichen Diensten,
- Vermeidung von D-F-D-F-Mustern,
- historische Lastkorrektur,
- Samstagsrotation in der Facharztgruppe.

### 8.3 Personenspezifische Logiken

Aktiv im Code hinterlegt:

- Dr. Polednia: Sperren für bestimmte Wochentage in BD/HG-AA-Kontext.
- Dr. Becker: Samstags-BD im strengen Modus ausgeschlossen, nur gelockert als Notlösung; danach FZA-Komponente.
- Dr. Becker + Dr. Martin: CT-Führungsinterdependenz auf Folgetag.
- Fr. Dalitz: HG-Sperren in Kollision mit Torki/Sebastian-BD an So/Mo.

### 8.4 Bundling-Regeln (deterministische HG-Kopplung)

Vor freier HG-Verteilung werden feste Kopplungen gesetzt, z. B.:

- AA-Freitags-BD -> HG-Kopplung mit Samstag-FA-BD,
- weitere Wochenend/Feiertags-Kopplungen je Konstellation.

---

## 9. Scoring-, Objective- und Qualitätsmetriken

Es existieren **zwei Ebenen**:

1. **Kandidatenscoring** (wer bekommt Tag X?),
2. **Global Objective** (wie gut ist der gesamte Monatsplan?).

### 9.1 Beispielhafte BD-Objective-Gewichte

- BD-Lücke pro Tag: +20.000 (BD-Teilobjective),
- doppelte BD-Besetzung: +50.000 * Anzahl,
- Zielabweichung: quadratisch + linear,
- WE-Überlast > Limit: zusätzliche harte Strafe,
- aufeinanderfolgende WE-KWs: +15.000,
- zweiter Samstag: massive Zusatzstrafe,
- Becker-Samstag: Zusatzstrafe,
- D-F-D-F-Muster: zusätzliche Pattern-Strafe.

### 9.2 Beispielhafte HG-Objective-Gewichte

- HG-Lücke pro Tag: +15.000,
- doppelte HG-Besetzung: +40.000 * Anzahl,
- Abweichung von Ideal-HG (inkl. BD-Kompensation): stark quadratisch,
- HG-AA/HG-FA-Balance,
- Adjacent-HG und kurze Abstände hoch penalisiert,
- Dichteprüfung im ±3-Tage-Fenster,
- HG vor eigenem D (außer zulässige Freitagskopplung): starke Strafe.

### 9.3 Global Objective

`Global = BD-Objective + HG-Objective + CoveragePenalty`

CoveragePenalty ergänzt zusätzliche harte Sanktionen für fehlende/mehrfache Dienste pro Tag.

### 9.4 Endqualität (`quality.score`)

Aus dem finalen Plan wird ein Score 0..100 berechnet:

- Abdeckungsdefizite D/HG,
- Spread BD/HG/WE,
- Wunscherfüllungsrate,
- Deep-Move-Kosten.

Damit sind Pläne vergleichbar, auch wenn mehrere „gültig“ sind.

---

## 10. Historische Daten, Fairness und Lastausgleich

### 10.1 Historischer Sammellauf

Der Planer aggregiert aus vergangenen Monaten u. a.:

- BD-Anzahl,
- HG-Anzahl,
- WE-Dienstäquivalente,
- Feiertagsdienste,
- Donnerstag-BD,
- Samstags-BD,
- HG für AA vs HG für FA.

### 10.2 Einsatz historischer Werte

Historische Last dient primär als Korrektiv/Tie-Breaker, während der aktuelle Monat die Hauptoptimierungsbasis bleibt.

### 10.3 HG-Idealformel

HG-Verteilung wird gegen ein idealisiertes Niveau gerechnet, das die aktuelle BD-Last innerhalb der FA-Gruppe kompensiert (wer weniger BD trägt, soll mehr HG übernehmen).

---

## 11. Import/Export, Integritätsreparatur und API-Mock

### 11.1 Export

- serialisiert Hauptdaten + gespeicherte Planentwürfe,
- erstellt JSON-Datei clientseitig.

### 11.2 Import

- validiert JSON-Struktur,
- merged Daten in lokalen Bestand,
- führt Integritätsreparatur (`ensurePostBDFreiDays`) aus.

### 11.3 API-Mock in `render.js`

`window.fetch` wird abgefangen:

- `/api?action=save` -> synthetisch erfolgreich,
- `/api?action=load` -> synthetischer Fehler -> lokaler Fallback.

Ziel: konsistente Offline-Nutzung ohne echte Serverabhängigkeit.

---

## 12. Visualisierung des Algorithmus (NeuralGraph)

Der Rechenkern liefert Telemetrie-Events (Phasen, Swaps, Resultate), die in einer separaten Visualisierung animiert werden:

- isometrisches Grid,
- Phasenfarben,
- Aktivitäts-/Flux-Effekte,
- Erfolg/Abschluss-Signal.

Die Visualisierung ist erklärend, nicht entscheidungsführend: Entscheidungen trifft ausschließlich `autoplan.js`.

---

## 13. Fachliche Codes, Rollen und Semantik

### 13.1 Arbeitsplätze

`MR`, `CT`, `US`, `AN`, `MA`, `KUS`, `W`, `T`

### 13.2 Status-/Absenzcodes

`F`, `U`, `ZU`, `SU`, `FZA`, `K`, `KK`, `§15c`, `WB`

### 13.3 Dienstcodes

- `D` = Bereitschaftsdienst
- `HG` = Hintergrunddienst

### 13.4 Wünsche

- `NO_DUTY`
- `BD_WISH`
- `HG_WISH`

### 13.5 Rollenklassifikation

Die Qualifikation (FA/AA etc.) wird über `EMP_META` und Hilfsfunktionen (`isFacharzt`, `isAssistenzarzt`) gesteuert und direkt in der Regelprüfung verwendet.

---

## 14. Bedienung: Workflow-Empfehlung Schritt für Schritt

1. Zeitraum wählen (Monat/Jahr).
2. Mitarbeitende und Basiszuweisungen prüfen.
3. Abwesenheiten vollständig eintragen.
4. Wünsche erfassen.
5. Planmodus starten.
6. Auto-Plan ausführen.
7. Report + Warnungen + Qualitätsscore prüfen.
8. Manuelle Korrekturen im Draft.
9. Undo/Redo für Variantenvergleich nutzen.
10. Entwurf übernehmen.
11. Export erstellen.

---

## 15. Grenzen, implizite Annahmen und bekannte Trade-offs

- Starke personenspezifische Regeln sind im Code fest verdrahtet (nicht vollständig datengetrieben konfigurierbar).
- Einige Regeln sind „hart“, andere über hohe Penalties erzwungen; im Grenzfall kann Lockerung greifen, um Vollabdeckung zu erreichen.
- Monatssicht ist primär; Historie wird als Ausgleichsindikator genutzt, nicht als globales Ganzjahres-Optimierungsproblem.
- Lokale Browserpersistenz ist robust für Einzelarbeitsplätze, aber ohne externen Sync kein Multi-User-Transaktionsmodell.

---

## 16. Datei- und Modulübersicht

- `index.html`: UI-Struktur und Modals.
- `js/constants.js`: Codes, Rollen, Datums-/Feiertagswerkzeuge, Hilfsfunktionen.
- `js/state.js`: globaler Zustand + Load/Save.
- `js/model.js`: Datenzugriff, Mutation, Kennzahlen, Reparatur.
- `js/app.js`: Controller & Eventorchestrierung.
- `js/render.js`: Renderpipeline, responsive Layout, API-Mock.
- `js/autoplan.js`: vollständiger Planungsalgorithmus inkl. Regelkatalog, Optimierung und Qualitätsmodell.
- `js/neuralgraph.js`: algorithmische Visualisierungsengine.
- `css/*.css`: visuelle Schichten (Core/Layout/Components/Views/Modals/Scheduler).
- `functions/api.js`: API-bezogene Hilfsschicht.

---

## Schlussbemerkung

Diese README ist bewusst als **vollständige Betriebs- und Entscheidungsdokumentation** geschrieben. Für Änderungen am Regelwerk sollten Anpassungen im `autoplan.js` immer gemeinsam mit Aktualisierung dieser README erfolgen, damit fachliche Erwartungen, UI-Verhalten und algorithmische Realität dauerhaft synchron bleiben.
