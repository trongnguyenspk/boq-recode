import type { StarterConfig, Brand, StarterType, Product, Unit, ComponentCondition } from '../types';
import { sanitizeProduct, sanitizeStarter } from './import-validation';

export async function importLibraryFromExcel(file: File): Promise<Product[]> {
    try {
        // @ts-ignore
        const XLSX = window.XLSX || await import('xlsx');

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);

                    const products: Product[] = jsonData.map((row: any) => sanitizeProduct(row));

                    resolve(products);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    } catch (error) {
        console.error("Library import error:", error);
        throw error;
    }
}

export async function importStartersFromExcel(file: File): Promise<StarterConfig[]> {
    try {
        // @ts-ignore
        const XLSX = window.XLSX || await import('xlsx');

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // Assume first sheet is the data
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];

                    // Convert to JSON
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);

                    // Map to StarterConfig
                    const starters: StarterConfig[] = jsonData.map((row: any) => sanitizeStarter(row));

                    resolve(starters);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    } catch (error) {
        console.error("Excel import error:", error);
        throw error;
    }
}

export async function downloadImportTemplate() {
    try {
        // @ts-ignore
        const XLSX = window.XLSX || await import('xlsx');

        const wb = XLSX.utils.book_new();
        const templateData = [
            {
                Type: 'DOL',
                Power: 0.18,
                Quantity: 1,
                Description: 'Bơm nước thải',
                Brand: 'Schneider',
                Isolator: 'No',
                IsolatorBrand: '',
                Thermal: 'No',
                PTC: 'No',
                Estop: 'No',
                Humidity: 'No'
            },
            {
                Type: 'Star-Delta',
                Power: 15,
                Quantity: 2,
                Description: 'Quạt hút khói',
                Brand: 'Mitsubishi',
                Isolator: 'Yes',
                IsolatorBrand: 'Mitsubishi',
                Thermal: 'Yes',
                PTC: 'No',
                Estop: 'Yes',
                Humidity: 'No'
            }
        ];

        const ws = XLSX.utils.json_to_sheet(templateData);
        XLSX.utils.book_append_sheet(wb, ws, "Template");

        // @ts-ignore
        if (window.showSaveFilePicker) {
            try {
                // @ts-ignore
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'Import_Template.xlsx',
                    types: [{
                        description: 'Excel File',
                        accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
                    }],
                });
                const writable = await handle.createWritable();
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([wbout], { type: 'application/octet-stream' });
                await writable.write(blob);
                await writable.close();
                return;
            } catch (err: any) {
                if (err.name === 'AbortError') return;
                console.warn("File System Access API failed, falling back to default download", err);
            }
        }

        XLSX.writeFile(wb, "Import_Template.xlsx");
    } catch (error) {
        console.error("Template download error:", error);
    }
}

export async function importTemplatesFromExcel(file: File): Promise<Record<string, Record<string, { matchKey: string; qty: number; condition?: ComponentCondition }[]>>> {
    try {
        // @ts-ignore
        const XLSX = window.XLSX || await import('xlsx');

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);

                    const templates: Record<string, Record<string, { matchKey: string; qty: number; condition?: ComponentCondition }[]>> = {};

                    jsonData.forEach((row: any) => {
                        const type = row['StarterType'];
                        const power = String(row['Power']);
                        const matchKey = row['ComponentMatchKey'];
                        const qty = Number(row['Quantity'] || 1);
                        const condition = (row['Condition'] || 'always') as ComponentCondition;

                        if (!type || !power || !matchKey) return;

                        if (!templates[type]) templates[type] = {};
                        if (!templates[type][power]) templates[type][power] = [];

                        templates[type][power].push({ matchKey, qty, condition });
                    });

                    resolve(templates);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    } catch (error) {
        console.error("Template import error:", error);
        throw error;
    }
}

export async function importMatchKeysFromExcel(file: File, currentLibrary: Product[], brands: Brand[]): Promise<Product[]> {
    try {
        // @ts-ignore
        const XLSX = window.XLSX || await import('xlsx');

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);

                    if (jsonData.length === 0) {
                        reject(new Error("Excel file is empty or could not be parsed."));
                        return;
                    }

                    const newLibrary = [...currentLibrary];
                    let addedCount = 0;
                    let updatedCount = 0;

                    jsonData.forEach((row: any) => {
                        const normalizedRow: any = {};
                        Object.keys(row).forEach(key => {
                            normalizedRow[key.replace(/\s+/g, '').toLowerCase()] = row[key];
                        });

                        const matchKey = normalizedRow['matchkey'];
                        const description = normalizedRow['description'];
                        const unit = normalizedRow['unit'] || 'Cái';
                        const ibomCode = normalizedRow['ibomcode'];

                        if (!matchKey) return;

                        brands.forEach(brand => {
                            const brandKey = `${brand.toLowerCase()}_code`;
                            const code = normalizedRow[brandKey];

                            if (code) {
                                const existingIndex = newLibrary.findIndex(p => p.matchKey === matchKey && p.brand === brand);

                                if (existingIndex >= 0) {
                                    newLibrary[existingIndex] = {
                                        ...newLibrary[existingIndex],
                                        code: code,
                                        description: description || newLibrary[existingIndex].description,
                                        ibomCode: ibomCode || newLibrary[existingIndex].ibomCode,
                                        unit: unit
                                    };
                                    updatedCount++;
                                } else {
                                    newLibrary.push({
                                        id: crypto.randomUUID(),
                                        matchKey,
                                        brand: brand as Brand,
                                        code,
                                        description: description || '',
                                        ibomCode: ibomCode || '',
                                        unit,
                                        price: 0
                                    });
                                    addedCount++;
                                }
                            }
                        });
                    });

                    console.log(`Import Summary: Added ${addedCount}, Updated ${updatedCount}`);
                    resolve(newLibrary);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    } catch (error) {
        console.error("Match Key import error:", error);
        throw error;
    }
}
