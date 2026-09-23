import { bathPackages } from '../config/business';

export interface FaqItem {
  question: string;
  answer: string;
}

const [essenza, colore, atelier] = bathPackages;

/** Häufige Fragen zum Badumbau (Text auch für FAQPage-Schema) */
export const badumbauFaq: FaqItem[] = [
  {
    question: 'Was kostet ein Badumbau in der Region Zofingen?',
    answer: `Unsere drei Pakete beginnen bei CHF ${essenza.priceLabel}, CHF ${colore.priceLabel} und CHF ${atelier.priceLabel} inkl. MwSt. Grundlage ist ein Referenzbad von ca. 6 m² mit ca. 21 m² Plattenfläche. Der genaue Preis hängt unter anderem von Bestand, Anschlüssen, gewählten Produkten und Zusatzarbeiten ab. Nach der Besichtigung erhalten Sie eine verbindliche Offerte.`,
  },
  {
    question: 'Wie lange dauert ein kompletter Badumbau?',
    answer:
      'Für die Ausführung eines Standardbads rechnen wir in der Regel mit zwei bis drei Wochen. Planung, Produktauswahl und Lieferzeit liegen davor und werden im Terminplan separat berücksichtigt. Den konkreten Ablauf erhalten Sie mit der Offerte.',
  },
  {
    question: 'Kann ich das Bad während des Umbaus benutzen?',
    answer: 'Während der Bauarbeiten ist das Bad normalerweise nicht benutzbar. Wenn kein zweites WC oder Bad vorhanden ist, besprechen wir vor dem Start, ob eine provisorische Lösung möglich und sinnvoll ist.',
  },
  {
    question: 'Muss ich Sanitär, Elektro und Plattenarbeiten selbst organisieren?',
    answer: 'Nein, sofern diese Leistungen Bestandteil Ihrer Offerte sind. Wir koordinieren die vereinbarten Facharbeiten und bleiben für den abgestimmten Ablauf Ihr Ansprechpartner. Welche Leistungen enthalten sind, steht vor dem Start eindeutig in der Offerte.',
  },
  {
    question: 'Was ist im Badpaket enthalten?',
    answer: 'Die Produkt- und Leistungslisten stehen direkt beim jeweiligen Paket. Grundlage ist ein Bad von ca. 6 m² mit ca. 21 m² Plattenfläche. Änderungen an Wänden, Leitungsführungen, Statik oder eine notwendige Schadstoffsanierung sind nur enthalten, wenn sie ausdrücklich in der Offerte aufgeführt sind.',
  },
  {
    question: 'Kann ich Farben, Platten und Armaturen selbst wählen?',
    answer: 'Ja. Innerhalb der beim Paket genannten Serien wählen Sie die verfügbaren Farben und Oberflächen ohne Aufpreis. Wünsche ausserhalb dieser Auswahl prüfen und offerieren wir separat.',
  },
  {
    question: 'Kann ich die Kosten steuerlich abziehen?',
    answer: 'Ob und in welchem Umfang ein Badumbau steuerlich abzugsfähig ist, hängt vom Steuerjahr, vom Kanton, von der Art der Arbeiten und von Ihrer persönlichen Situation ab. Verbindliche Auskunft erhalten Sie bei Ihrer Steuerbehörde oder Treuhandstelle. Auf Wunsch weisen wir unterschiedliche Leistungsarten in der Rechnung nachvollziehbar aus, soweit dies sachlich möglich ist.',
  },
  {
    question: 'In welchen Gemeinden arbeiten Sie?',
    answer:
      'Unser Ausführungsgebiet liegt ungefähr 40 km rund um Zofingen. Die aktuelle Ortsliste steht auf dieser Seite. Senden Sie uns Ihre Postleitzahl; wir bestätigen, ob Ihr Projekt im Gebiet liegt.',
  },
];
