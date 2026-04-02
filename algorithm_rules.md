# Algorithmische Spezifikation: RadPlan Neural Scheduler (v3.2)

Der RadPlan Neural Scheduler ist ein hochkomplexes Optimierungssystem, das darauf ausgelegt ist, eine mathematisch perfekte Verteilung von Bereitschaftsdiensten (BD) und Hintergrunddiensten (HG) zu generieren. Er operiert in einem hoch-iterativen Umfeld und nutzt eine Kombination aus deterministischen Regeln, probabilistischem Scoring und einer globalen Metaheuristik (Swap-Optimierung). Der gesamte Prozess wird transparent durch den **Neural Fitness Index (NFI)** gemessen und bewertet.

## 1. Systemarchitektur & Prozesssteuerung
Das System arbeitet nicht linear, sondern in einer massiv erweiterten 15-fachen Schleife (Cycles). In jedem Zyklus werden tausende von potenziellen Dienst-Konfigurationen simuliert und gegeneinander abgewogen. Das Ziel ist die Minimierung der "Global Objective Function" – einer Kostenfunktion, die Regelverstöße und Unfairness mit massiven Strafpunkten (Penalties) belegt.

### Die Optimierungs-Pipeline:
1. **Initialisierungs-Phase:** Aggregation historischer Statistiken (seit dem 01.01. des laufenden Jahres) und Sicherung manuell gesetzter Dienste. Automatische Korrektur fehlender Ruhetage (F) nach fixen Bereitschaftsdiensten.
2. **Konstruktive Phase (Greedy):** Erstverteilung der BDs an Wochenenden und Feiertagen, gefolgt von Werktagen. Hierbei werden harte Ausschlusskriterien (Urlaub, gesetzliche Abstände, spezifische Sperren) strikt beachtet.
3. **Deterministische Kopplung (HG-Bundling):** Automatische Bindung von HG-Diensten an spezifische BD-Szenarien (z. B. AA-Freitags-Kopplung, FA-Wochenend-Kette, Feiertags-Vortags-Kopplung).
4. **HG-Rhythmisierung:** Erstverteilung der verbleibenden HG-Lücken unter strengster Berücksichtigung der neuen Anti-Clustering-Logik.
5. **Multi-Zyklus-Optimierung (15 Zyklen):**
   - **BD-Swap-Pass (80 Durchläufe):** Verfeinerung der BD-Gerechtigkeit und Auflösung lokaler Unausgewogenheiten.
   - **HG-Swap-Pass (120 Durchläufe):** Aktives Aufbrechen von HG-Clustern und Glättung des monatlichen Arbeitsrhythmus.
   - **Globaler Deep-Optimize-Pass (150 Durchläufe):** Systemweite Cross-Role-Swaps zur Behebung hochkomplexer Interdependenz-Konflikte (z. B. CT-Leitung oder Mammographie-Kollisionen).
   - **Coverage-Repair:** Dynamische Schließung etwaiger verbleibender Lücken durch Zwangs-Zuweisungen an die am wenigsten belasteten Mitarbeiter.
6. **Validierungs-Phase:** Letzte Integritätsprüfung der Dienst-Exklusivität (max. ein Dienst pro Tag) und Datenkonsistenz.

## 2. Detailliertes Regelwerk (Constraint Catalog)

### 2.1 Harte Constraints (K.-o.-Kriterien)
Verletzungen dieser Regeln führen zur sofortigen Ablehnung eines Kandidaten in der Initialphase (-Infinity) oder massiven Strafen in der Objective Function.
- **Abwesenheits-Integrität:** Kein Dienst bei Status U, ZU, SU, §15c, K, KK, FZA, WB.
- **Wunscherfüllung:** Der Wunsch "Kein Dienst" (NO_DUTY) wird als hartes Ausschlusskriterium behandelt.
- **Gesetzliche Ruhezeit:** Nach jedem BD am Tag X ist der Tag X+1 zwingend als "F" zu markieren (gilt für Werktage).
- **Dienst-Exklusivität:** Maximal ein D oder HG pro Kalendertag pro Person.
- **Qualifikations-Sperre:** Samstags-Dienste und HG-Dienste sind ausschließlich Fachärzten (FA) vorbehalten.
- **BD-Folge-Sperre:** Keine BD-Dienste an zwei aufeinanderfolgenden Tagen (D-D Verbot).
- **HG-Vortag-Sperre (AA-Regel):** Ein FA darf keinen HG für einen AA leisten, wenn der FA am Folgetag selbst BD hat (späterer Dienstbeginn verhindert rechtzeitige Befundfreigabe).
- **Spezial-Sperre Dr. Polednia:** Absolutes BD-Verbot an Sonntagen, Dienstagen und Donnerstagen. Ebenso absolutes HG-Verbot für AAs an diesen Tagen (Vermeidung von Kollisionen mit dem Kinder-Ultraschall am Folgetag).
- **Spezial-Sperre Fr. Dalitz (Mammographie):** Fr. Dalitz darf niemals einen HG an einem Sonntag oder Montag leisten, wenn gleichzeitig Herr Torki oder Herr Sebastian den BD innehat. Die Befundfreigabe würde hierbei am Montagmorgen bzw. Dienstagmorgen mit ihrem Einsatz in der Mammographie kollidieren.
- **CT-Leitungs-Interdependenz:** Dr. Becker und Dr. Martin dürfen an Werktagen niemals gleichzeitig abwesend (Urlaub/Frei/FZA) sein. Der Algorithmus plant die Dienste (und deren nachgelagerte Ruhetage) proaktiv um diese Vorgabe herum.
- **Urlaubs-Puffer:** Kein BD am Tag direkt vor einem Urlaubsantritt.
- **Feiertags-Alternanz:** Wer an Ostern Dienst hat, wird für Pfingsten gesperrt (und umgekehrt).

### 2.2 Anti-Clustering & Rhythmus-Logik (HG-Fokus)
Um zusammenhängende "Dienst-Blöcke" und Überlastung zu verhindern, nutzt der Scheduler ein starkes Bestrafungssystem:
- **Abstands-Malus (3-Tage):** Ein HG-Dienst innerhalb von 3 Tagen nach einem anderen HG wird mit -8.000 Pkt. (Scoring) bzw. +18.000 Pkt. (Objective) bestraft.
- **Direkt-Folge-Malus:** Back-to-back HG-Dienste (außer bei zwingenden Kopplungen) werden mit -25.000 Pkt. (Scoring) bzw. +45.000 Pkt. (Objective) massiv abgewertet.
- **Dichte-Prüfung (Rolling Window):** In jedem 7-Tage-Fenster wird die Anzahl der HGs pro Person überwacht. Jede Überschreitung der Dichte von 1 Dienst pro Fenster (ausgenommen Kopplungen) kostet in der Objective Function zusätzlich +12.000 Pkt.

### 2.3 Kopplungs-Modelle (Bundling)
Deterministische Verknüpfungen, die noch vor der freien Optimierung gesetzt werden:
- **Modell "Freitags-Support":** Hat ein AA am Freitag BD, übernimmt der FA des Samstags-BDs zwingend den Freitag-HG.
- **Modell "Wochenend-Kette":** Ein FA mit Samstags-BD übernimmt zwingend den Sonntag-HG (HG-D-HG Kette).
- **Modell "Feiertags-Vortag":** Hat ein AA am Vortag eines Feiertags BD, übernimmt der FA des Feiertags-BDs den HG am Vortag.

## 3. Mathematische Kostenfaktoren (Objective Penalties)

Der Scheduler sucht iterativ nach der Lösung mit dem niedrigsten Gesamt-Score.

| Metrik / Verstoß | Straffaktor (Gewichtung in der Objective Function) |
| :--- | :--- |
| **Ungedeckter BD-Tag** | + 25.000 |
| **Ungedeckter HG-Tag** | + 18.000 |
| **Abweichung vom BD-Monatsziel** | (Diff² * 25.000) + (\|Diff\| * 10.000) |
| **HG-Fairness (Abweichung v. Ideal)** | (Diff_zu_Ideal)² * 25.000 |
| **HG-Typ-Balance (AA-HG vs. FA-HG)** | (Diff_zu_Avg)² * 15.000 |
| **Fr. Dalitz vs. Torki/Sebastian (So/Mo)** | + 100.000 (K.O.-Kriterium im Swap) |
| **Illegale BD-Folge (D-D)** | + 100.000 |
| **HG vor eigenem BD (außer Fr)** | + 60.000 |
| **Nicht-gekoppelter Adjacent HG** | + 45.000 |
| **Dichte-Verstoß (HG-Block im 7-Tage-Fenster)** | + 12.000 |
| **BD-Mindestabstand < 3 Tage** | (3-Dist) * 15.000 |
| **Zweiter Samstags-BD im Monat** | + 80.000 |
| **Becker-Samstag (Notlösung)** | + 40.000 |
| **D-F-D-F Muster** | + 1.200 |

## 4. Workload-Fairness-Kalkül (HG-Berechnung)
Die Lastverteilung der HG-Dienste erfolgt streng mathematisch auf Basis der aktuellen BD-Belastung:
`Ideal_HG_Anzahl = Monats_Durchschnitt_HG + (Durchschnitt_BD_der_FAs - Individuelle_BD_Anzahl) * 1.0`
Dieses Modell garantiert absolute Ausgewogenheit: Ein Facharzt, der einen BD weniger als der Durchschnitt leistet, muss exakt einen HG mehr als der Durchschnitt übernehmen. Historische Daten des Vorjahres dienen nur als minimaler "Tie-Breaker", falls zwei Kandidaten für denselben Tag einen identischen in-month Score aufweisen.

## 5. Neural Fitness Index (NFI)
Die Qualität des errechneten Plans wird transparent und hochpräzise über den **Neural Fitness Index (NFI)** auf einer Skala von 0.0 bis 100.0 gemessen. Er setzt sich wie folgt zusammen:
- **36% BD-Abdeckung:** Malus bei Lücken im Bereitschaftsdienst-Netz.
- **24% HG-Abdeckung:** Malus bei fehlender Hintergrund-Absicherung.
- **16% BD-Gerechtigkeit:** Skalierung des maximalen Unterschieds (Spread) der BD-Anzahl zwischen den Fachärzten.
- **10% HG-Gerechtigkeit:** Skalierung der HG-Verteilungsunterschiede.
- **8% WE-Fairness:** Ausgewogenheit der Wochenend-Äquivalente (Ziel 1.0).
- **6% Wunscherfüllung:** Erfüllte Wünsche (BD_WISH, HG_WISH) im Verhältnis zu allen geäußerten positiven Wünschen.
- **Deep-Move-Korrelation:** Winziger Feinabzug für erzwungene Extrem-Swaps zur Vermeidung von Score-Inflation.

Der Algorithmus läuft künstlich für exakt ~22 Sekunden in der "Orbital Core Animation", um sicherzustellen, dass die Rechentiefe ausgeschöpft wurde und dem Anwender das Volumen der simulierten Kombinationen veranschaulicht wird.
