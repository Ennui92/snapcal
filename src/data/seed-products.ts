// Bundled seed catalogue of common products found on Greek supermarket shelves.
// Nutrition values are per 100g/100ml. Barcodes are only included where sourced
// from a verified public record (Open Food Facts); when we could not verify the
// exact EAN for a product we ship it with an empty `barcodes` array so it still
// surfaces through name search, rather than risk mislabeling a scanned barcode.
export type SeedProduct = {
  barcodes: string[];
  name: string;
  brand: string;
  country: 'GR' | 'EU';
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  sugarPer100g: number;
  servingGrams?: number;
};

export const SEED_PRODUCTS: SeedProduct[] = [
  { barcodes: ['5201057011413'], name: 'Σοκολάτα Γάλακτος', brand: 'Lacta', country: 'GR', kcalPer100g: 527, proteinPer100g: 6.4, carbsPer100g: 59.2, fatPer100g: 28, sugarPer100g: 56, servingGrams: 25 },
  { barcodes: ['7622202038686'], name: 'Lacta Nuts ολόκληρο φουντούκι', brand: 'Lacta', country: 'GR', kcalPer100g: 558, proteinPer100g: 8, carbsPer100g: 52, fatPer100g: 34, sugarPer100g: 48, servingGrams: 37 },
  { barcodes: ['7622210717986'], name: 'Lacta Oreo', brand: 'Lacta', country: 'GR', kcalPer100g: 548, proteinPer100g: 6, carbsPer100g: 63, fatPer100g: 29, sugarPer100g: 46, servingGrams: 37 },
  { barcodes: ['5201127012135'], name: 'Ion Αμυγδάλου', brand: 'ΙΟΝ', country: 'GR', kcalPer100g: 559, proteinPer100g: 7, carbsPer100g: 52, fatPer100g: 34, sugarPer100g: 48, servingGrams: 42 },
  { barcodes: ['5201004021076'], name: 'Digestive χωρίς ζάχαρη', brand: 'Παπαδοπούλου', country: 'GR', kcalPer100g: 486, proteinPer100g: 7.6, carbsPer100g: 57, fatPer100g: 23, sugarPer100g: 20, servingGrams: 14 },
  { barcodes: ['5201004040633'], name: 'Γεμιστά με γεύση σοκολάτας', brand: 'Παπαδοπούλου', country: 'GR', kcalPer100g: 483, proteinPer100g: 6.3, carbsPer100g: 68, fatPer100g: 20, sugarPer100g: 29, servingGrams: 44 },
  { barcodes: ['5201004043276'], name: '2πλογεμιστά με πραλίνα φουντουκιού', brand: 'Παπαδοπούλου', country: 'GR', kcalPer100g: 500, proteinPer100g: 5.6, carbsPer100g: 63, fatPer100g: 24, sugarPer100g: 38, servingGrams: 46 },
  { barcodes: ['5201054017432'], name: 'Total 5% Greek Yogurt', brand: 'FAGE', country: 'GR', kcalPer100g: 93, proteinPer100g: 5.4, carbsPer100g: 4.8, fatPer100g: 5, sugarPer100g: 4.8, servingGrams: 200 },
  { barcodes: ['5201054001240'], name: 'Total 2% Γιαούρτι', brand: 'FAGE', country: 'GR', kcalPer100g: 70, proteinPer100g: 7.5, carbsPer100g: 4, fatPer100g: 2, sugarPer100g: 4, servingGrams: 200 },
  { barcodes: ['5201054018781'], name: 'Γιαούρτι στραγγιστό 0% Total', brand: 'FAGE', country: 'GR', kcalPer100g: 54, proteinPer100g: 10, carbsPer100g: 4, fatPer100g: 0.2, sugarPer100g: 4, servingGrams: 200 },
  { barcodes: ['5202178050084'], name: 'Φρέσκο Γάλα 1,7%', brand: 'Olympos', country: 'GR', kcalPer100g: 49, proteinPer100g: 3.4, carbsPer100g: 4.8, fatPer100g: 1.7, sugarPer100g: 4.8, servingGrams: 1000 },
  { barcodes: ['5201010144523'], name: 'Κριθαράκι Μέτριο', brand: 'Misko', country: 'GR', kcalPer100g: 364, proteinPer100g: 12, carbsPer100g: 74, fatPer100g: 1.5, sugarPer100g: 3, servingGrams: 500 },
  { barcodes: ['5201010015083'], name: 'Penne Rigate', brand: 'Misko', country: 'GR', kcalPer100g: 347, proteinPer100g: 12, carbsPer100g: 71, fatPer100g: 1.5, sugarPer100g: 3, servingGrams: 500 },
  { barcodes: ['5201193100019'], name: 'Spaghetti n.6', brand: 'Melissa', country: 'GR', kcalPer100g: 356, proteinPer100g: 12, carbsPer100g: 72, fatPer100g: 1.5, sugarPer100g: 3.8, servingGrams: 500 },
  { barcodes: ['5201193106011'], name: 'Κριθαράκι χονδρό', brand: 'Melissa', country: 'GR', kcalPer100g: 356, proteinPer100g: 12, carbsPer100g: 72, fatPer100g: 1.5, sugarPer100g: 3.8, servingGrams: 500 },
  { barcodes: ['5202234620329'], name: 'Authentic Greek Yogurt 10% Fat', brand: 'Kri Kri', country: 'GR', kcalPer100g: 130, proteinPer100g: 4, carbsPer100g: 4.5, fatPer100g: 10, sugarPer100g: 4.5, servingGrams: 200 },
  { barcodes: ['5202234632001'], name: 'Super Spoon High Protein', brand: 'Kri Kri', country: 'GR', kcalPer100g: 81, proteinPer100g: 12, carbsPer100g: 5, fatPer100g: 1.5, sugarPer100g: 5, servingGrams: 200 },
  { barcodes: ['5201168215649'], name: 'Φέτα ΠΟΠ', brand: 'Δωδώνη', country: 'GR', kcalPer100g: 257, proteinPer100g: 17, carbsPer100g: 0, fatPer100g: 21, sugarPer100g: 0, servingGrams: 200 },
  { barcodes: ['8716200615020'], name: 'Εβαπορέ Γάλα', brand: 'NOUNOU', country: 'GR', kcalPer100g: 73, proteinPer100g: 6.8, carbsPer100g: 9.8, fatPer100g: 1.5, sugarPer100g: 9.8, servingGrams: 400 },
  { barcodes: ['5201005079687'], name: 'Boost', brand: 'Frulite', country: 'GR', kcalPer100g: 46, proteinPer100g: 0.3, carbsPer100g: 11, fatPer100g: 0, sugarPer100g: 10, servingGrams: 500 },
  { barcodes: ['5201005074156'], name: 'Πορτοκάλι Βερίκοκο Μήλο', brand: 'Amita', country: 'GR', kcalPer100g: 57, proteinPer100g: 0.5, carbsPer100g: 13.5, fatPer100g: 0, sugarPer100g: 12, servingGrams: 1000 },
  { barcodes: ['5201005001473'], name: 'Sour Cherry', brand: 'Amita', country: 'GR', kcalPer100g: 60, proteinPer100g: 0.4, carbsPer100g: 14, fatPer100g: 0, sugarPer100g: 13, servingGrams: 250 },
  { barcodes: ['5202238163174'], name: 'Lemon Juice Drink', brand: 'Loux', country: 'GR', kcalPer100g: 48, proteinPer100g: 0, carbsPer100g: 12, fatPer100g: 0, sugarPer100g: 12, servingGrams: 330 },
  { barcodes: ['5202238163273'], name: 'Gazoza', brand: 'Loux', country: 'GR', kcalPer100g: 40, proteinPer100g: 0, carbsPer100g: 10, fatPer100g: 0, sugarPer100g: 10, servingGrams: 330 },
  { barcodes: ['5201171331121'], name: 'Orange Juice Drink', brand: 'EPSA', country: 'GR', kcalPer100g: 49, proteinPer100g: 0.3, carbsPer100g: 12, fatPer100g: 0, sugarPer100g: 11, servingGrams: 330 },
  { barcodes: ['5201171331039'], name: 'Sour Cherry Drink', brand: 'EPSA', country: 'GR', kcalPer100g: 60, proteinPer100g: 0.3, carbsPer100g: 14.5, fatPer100g: 0, sugarPer100g: 13, servingGrams: 330 },
  { barcodes: ['5449000214911'], name: 'Coca-Cola Original Taste', brand: 'Coca-Cola', country: 'EU', kcalPer100g: 42, proteinPer100g: 0, carbsPer100g: 10.6, fatPer100g: 0, sugarPer100g: 10.6, servingGrams: 330 },
  { barcodes: ['5449000214799'], name: 'Coca-Cola Zero', brand: 'Coca-Cola', country: 'EU', kcalPer100g: 0.3, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0, sugarPer100g: 0, servingGrams: 330 },
  { barcodes: ['5449000335906'], name: 'Fanta Orange', brand: 'Fanta', country: 'EU', kcalPer100g: 27, proteinPer100g: 0, carbsPer100g: 6.5, fatPer100g: 0, sugarPer100g: 6.5, servingGrams: 330 },
  { barcodes: ['5201399020135'], name: 'Parboiled Rice', brand: '3ΑΛΦΑ', country: 'GR', kcalPer100g: 344, proteinPer100g: 8, carbsPer100g: 75, fatPer100g: 0.9, sugarPer100g: 0.6, servingGrams: 500 },
  { barcodes: ['5201399030165'], name: 'Rings', brand: '3ΑΛΦΑ', country: 'GR', kcalPer100g: 452, proteinPer100g: 13, carbsPer100g: 58, fatPer100g: 17, sugarPer100g: 2.5, servingGrams: 100 },
  { barcodes: ['5201399010051'], name: 'Φακές', brand: '3ΑΛΦΑ', country: 'GR', kcalPer100g: 141, proteinPer100g: 11.3, carbsPer100g: 16.8, fatPer100g: 0.9, sugarPer100g: 0.5, servingGrams: 500 },
  { barcodes: ['5201106010107'], name: 'Ελαιόλαδο Classic', brand: 'Minerva', country: 'GR', kcalPer100g: 824, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 91.6, sugarPer100g: 0, servingGrams: 1000 },
  { barcodes: ['5201034031243'], name: 'Extra Παρθένο Ελαιόλαδο', brand: 'Altis', country: 'GR', kcalPer100g: 828, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 92, sugarPer100g: 0, servingGrams: 750 },
  { barcodes: ['5202575011374'], name: 'Ζαμπόν Καπνιστό', brand: 'Creta Farms', country: 'GR', kcalPer100g: 113, proteinPer100g: 18, carbsPer100g: 3.5, fatPer100g: 3, sugarPer100g: 1.5, servingGrams: 100 },
  { barcodes: ['5202575011367'], name: 'Γαλοπούλα Ψητή', brand: 'Creta Farms', country: 'GR', kcalPer100g: 103, proteinPer100g: 17, carbsPer100g: 3, fatPer100g: 2.5, sugarPer100g: 1, servingGrams: 100 },
  { barcodes: ['5202575011329'], name: 'Γύρος Κοτόπουλο', brand: 'Creta Farms', country: 'GR', kcalPer100g: 186, proteinPer100g: 22, carbsPer100g: 2, fatPer100g: 10, sugarPer100g: 0.5, servingGrams: 165 },
  { barcodes: ['7613034152381'], name: 'Nestle Fitness Original', brand: 'Nestlé', country: 'GR', kcalPer100g: 368, proteinPer100g: 9.4, carbsPer100g: 74.9, fatPer100g: 1.8, sugarPer100g: 10.8, servingGrams: 375 },
  { barcodes: ['3387390320008'], name: 'Fitness Choc Barres Céréale', brand: 'Nestlé', country: 'GR', kcalPer100g: 382, proteinPer100g: 6.8, carbsPer100g: 66.4, fatPer100g: 9.1, sugarPer100g: 16.8, servingGrams: 23.5 },
  { barcodes: ['7622202021527'], name: 'Bake Rolls Κλασικό', brand: 'Chipita', country: 'GR', kcalPer100g: 436, proteinPer100g: 12, carbsPer100g: 62, fatPer100g: 15, sugarPer100g: 3, servingGrams: 150 },
  { barcodes: ['5201360655731'], name: 'Bake Rolls Pizza', brand: '7Days', country: 'GR', kcalPer100g: 446, proteinPer100g: 14, carbsPer100g: 62, fatPer100g: 14.5, sugarPer100g: 6, servingGrams: 150 },
  { barcodes: ['5201491588021'], name: 'Chips', brand: 'Tsakiris', country: 'GR', kcalPer100g: 520, proteinPer100g: 7, carbsPer100g: 51, fatPer100g: 30, sugarPer100g: 0.7, servingGrams: 140 },
  { barcodes: ['5201024782117'], name: 'Lay\'s Ολικής', brand: 'Lay\'s', country: 'GR', kcalPer100g: 477, proteinPer100g: 7, carbsPer100g: 59, fatPer100g: 22, sugarPer100g: 4, servingGrams: 95 },
  { barcodes: ['5201024009054'], name: 'Chips Salt and Vinegar', brand: 'Lay\'s', country: 'GR', kcalPer100g: 523, proteinPer100g: 6.5, carbsPer100g: 52, fatPer100g: 31, sugarPer100g: 0.7, servingGrams: 120 },
  { barcodes: ['5053990110872'], name: 'Pringles Emmental', brand: 'Pringles', country: 'EU', kcalPer100g: 509, proteinPer100g: 4.4, carbsPer100g: 52, fatPer100g: 31, sugarPer100g: 4.3, servingGrams: 165 },
  { barcodes: ['5053990141746'], name: 'Pringles Sour Cream & Onion', brand: 'Pringles', country: 'EU', kcalPer100g: 515, proteinPer100g: 4.2, carbsPer100g: 51, fatPer100g: 32, sugarPer100g: 2.5, servingGrams: 165 },
  { barcodes: ['7622201126032'], name: 'Merenda', brand: 'Pavlidis', country: 'GR', kcalPer100g: 524, proteinPer100g: 3.6, carbsPer100g: 64, fatPer100g: 28, sugarPer100g: 63, servingGrams: 400 },
  { barcodes: ['5201054073483'], name: 'Trikalino Semi Hard Cheese', brand: 'FAGE', country: 'GR', kcalPer100g: 310, proteinPer100g: 28, carbsPer100g: 0, fatPer100g: 22, sugarPer100g: 0, servingGrams: 200 },
  { barcodes: ['5201054004531'], name: 'Trikalino Light 10%', brand: 'FAGE', country: 'GR', kcalPer100g: 234, proteinPer100g: 36, carbsPer100g: 0, fatPer100g: 10, sugarPer100g: 0, servingGrams: 200 },
  { barcodes: ['5449000131836'], name: 'Coca-Cola Zero 500ml', brand: 'Coca-Cola', country: 'EU', kcalPer100g: 0.2, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0, sugarPer100g: 0, servingGrams: 500 },
  { barcodes: ['5449000000439'], name: 'Coca-Cola Original Taste 1.5L', brand: 'Coca-Cola', country: 'EU', kcalPer100g: 45, proteinPer100g: 0, carbsPer100g: 11.2, fatPer100g: 0, sugarPer100g: 11.2, servingGrams: 1500 },
  { barcodes: ['5449000335951'], name: 'Fanta Orange 500ml', brand: 'Fanta', country: 'EU', kcalPer100g: 27, proteinPer100g: 0, carbsPer100g: 6.5, fatPer100g: 0, sugarPer100g: 5.9, servingGrams: 500 },
  { barcodes: ['5449000252968'], name: 'Fanta Orange Zero Sugar', brand: 'Fanta', country: 'EU', kcalPer100g: 6, proteinPer100g: 0, carbsPer100g: 1.2, fatPer100g: 0, sugarPer100g: 1.2, servingGrams: 330 },
  { barcodes: ['5201193121700'], name: 'Σπαγγέτι Ολικής Άλεσης', brand: 'Melissa', country: 'GR', kcalPer100g: 356, proteinPer100g: 12.8, carbsPer100g: 68, fatPer100g: 2.1, sugarPer100g: 2.6, servingGrams: 500 },
  { barcodes: ['5201010013188'], name: 'Whole Grain Risoni', brand: 'Misko', country: 'GR', kcalPer100g: 347, proteinPer100g: 12, carbsPer100g: 71, fatPer100g: 1.5, sugarPer100g: 3, servingGrams: 500 },
  { barcodes: ['5202234632155'], name: 'High Protein Super Spoon Strawberry', brand: 'Kri Kri', country: 'GR', kcalPer100g: 62, proteinPer100g: 10, carbsPer100g: 6, fatPer100g: 0.5, sugarPer100g: 5, servingGrams: 150 },
  { barcodes: ['5206851067772'], name: 'Στραγγιστό Γιαούρτι 1,5%', brand: 'NOUNOU', country: 'GR', kcalPer100g: 72, proteinPer100g: 9, carbsPer100g: 4, fatPer100g: 1.5, sugarPer100g: 4, servingGrams: 200 },
  { barcodes: ['5201005079397'], name: 'Μανταρίνι Σαγκουίνι', brand: 'Frulite', country: 'GR', kcalPer100g: 49, proteinPer100g: 0.3, carbsPer100g: 12, fatPer100g: 0, sugarPer100g: 11, servingGrams: 330 },
  { barcodes: ['5202238020088'], name: 'Loux Plus \'n Light', brand: 'Loux', country: 'GR', kcalPer100g: 13, proteinPer100g: 0, carbsPer100g: 3, fatPer100g: 0, sugarPer100g: 3, servingGrams: 330 },
  { barcodes: ['5202575003119'], name: 'Λουκάνικα Χωριάτικα', brand: 'Creta Farms', country: 'GR', kcalPer100g: 293, proteinPer100g: 16, carbsPer100g: 1, fatPer100g: 25, sugarPer100g: 1, servingGrams: 100 },
  { barcodes: ['5202575011312'], name: 'Pork Gyros', brand: 'Creta Farms', country: 'GR', kcalPer100g: 313, proteinPer100g: 19, carbsPer100g: 3, fatPer100g: 25, sugarPer100g: 1, servingGrams: 165 },
  { barcodes: ['7613033213342'], name: 'Fitness Céréales Chocolat Noir', brand: 'Nestlé', country: 'GR', kcalPer100g: 401, proteinPer100g: 8.9, carbsPer100g: 68.5, fatPer100g: 8.3, sugarPer100g: 16.7, servingGrams: 30 },
  { barcodes: ['5201360655816'], name: 'Bake Rolls Barbecue', brand: '7Days', country: 'GR', kcalPer100g: 445, proteinPer100g: 14, carbsPer100g: 62, fatPer100g: 14.5, sugarPer100g: 4, servingGrams: 150 },
  { barcodes: ['5202558080168'], name: 'Le Petit Dejeuner Κανελάκια', brand: 'Tsakiris', country: 'GR', kcalPer100g: 424, proteinPer100g: 6.4, carbsPer100g: 67.1, fatPer100g: 13.2, sugarPer100g: 26.7, servingGrams: 40 },
  { barcodes: ['5201024786054'], name: 'Lays Στον Φούρνο', brand: 'Lay\'s', country: 'GR', kcalPer100g: 438, proteinPer100g: 6.1, carbsPer100g: 71.5, fatPer100g: 13.2, sugarPer100g: 6.7, servingGrams: 105 },
  { barcodes: ['5053990113699'], name: 'Pringles Nacho Cheese Tortilla', brand: 'Pringles', country: 'EU', kcalPer100g: 482, proteinPer100g: 5.6, carbsPer100g: 47, fatPer100g: 31, sugarPer100g: 3.5, servingGrams: 160 },
  { barcodes: ['7622201126131'], name: 'Merenda Σοκολατούχο Άλειμμα', brand: 'Merenda', country: 'GR', kcalPer100g: 525, proteinPer100g: 3.6, carbsPer100g: 64, fatPer100g: 28, sugarPer100g: 63, servingGrams: 400 },
  { barcodes: ['5201168218114'], name: 'Φέτα ΠΟΠ 1kg', brand: 'Δωδώνη', country: 'GR', kcalPer100g: 267, proteinPer100g: 17, carbsPer100g: 0, fatPer100g: 21, sugarPer100g: 0, servingGrams: 1000 },
  { barcodes: [], name: 'Classic', brand: 'ΙΟΝ', country: 'GR', kcalPer100g: 545, proteinPer100g: 7, carbsPer100g: 58, fatPer100g: 31, sugarPer100g: 55, servingGrams: 20 },
  { barcodes: [], name: 'Κριτσίνια Καπνιστά', brand: 'Παπαδοπούλου', country: 'GR', kcalPer100g: 445, proteinPer100g: 10, carbsPer100g: 68, fatPer100g: 14, sugarPer100g: 3, servingGrams: 30 },
  { barcodes: [], name: 'Στραγγιστό Γιαούρτι 2%', brand: 'Olympos', country: 'GR', kcalPer100g: 92, proteinPer100g: 8.5, carbsPer100g: 4, fatPer100g: 3.8, sugarPer100g: 4, servingGrams: 200 },
  { barcodes: [], name: 'Φρέσκο Γάλα 3,5%', brand: 'Δέλτα', country: 'GR', kcalPer100g: 64, proteinPer100g: 3.3, carbsPer100g: 4.7, fatPer100g: 3.6, sugarPer100g: 4.7, servingGrams: 1000 },
  { barcodes: [], name: 'Στραγγιστό Γιαούρτι 2%', brand: 'Δέλτα', country: 'GR', kcalPer100g: 90, proteinPer100g: 8.7, carbsPer100g: 4, fatPer100g: 3.5, sugarPer100g: 4, servingGrams: 200 },
  { barcodes: [], name: 'Spaghetti N.5', brand: 'Barilla', country: 'EU', kcalPer100g: 353, proteinPer100g: 12.5, carbsPer100g: 71, fatPer100g: 1.6, sugarPer100g: 3.2, servingGrams: 100 },
  { barcodes: [], name: 'Στραγγιστό Γιαούρτι', brand: 'Ήβη', country: 'GR', kcalPer100g: 122, proteinPer100g: 6, carbsPer100g: 4.5, fatPer100g: 9, sugarPer100g: 4.5, servingGrams: 200 },
  { barcodes: [], name: 'Φέτα ΠΟΠ', brand: 'Χωριό', country: 'GR', kcalPer100g: 264, proteinPer100g: 17, carbsPer100g: 1.5, fatPer100g: 21, sugarPer100g: 1.5, servingGrams: 200 },
  { barcodes: [], name: 'Original', brand: 'Sprite', country: 'EU', kcalPer100g: 34, proteinPer100g: 0, carbsPer100g: 8.3, fatPer100g: 0, sugarPer100g: 8.3, servingGrams: 330 },
  { barcodes: [], name: 'Pringles Original', brand: 'Pringles', country: 'EU', kcalPer100g: 536, proteinPer100g: 3.9, carbsPer100g: 53, fatPer100g: 34, sugarPer100g: 3, servingGrams: 165 },
  { barcodes: [], name: 'Φέτα ΠΟΠ', brand: 'Greek Feta', country: 'GR', kcalPer100g: 264, proteinPer100g: 17, carbsPer100g: 1.5, fatPer100g: 21, sugarPer100g: 1.5, servingGrams: 200 },
];
