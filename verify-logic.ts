
import { validateTemplate } from './src/utils/template-validation';

console.log('--- Verifying Validation Logic ---');

const valid = {
    type: 'DOL',
    name: 'Test',
    ratings: {
        '10kW': [{ matchKey: 'M1', qty: 1 }]
    }
};

const resValid = validateTemplate(valid);
console.log('Valid Template:', resValid.valid, resValid.errors.length === 0 ? 'OK' : resValid.errors);

const invalid = { ratings: {} };
const resInvalid = validateTemplate(invalid);
console.log('Invalid Template (No Type):', !resInvalid.valid, resInvalid.errors[0]?.message.includes('Missing required field: type') ? 'OK' : resInvalid.errors);

const invalidQty = {
    type: 'DOL',
    name: 'Test',
    ratings: {
        '10kW': [{ matchKey: 'M1', qty: 0 }]
    }
};
const resQty = validateTemplate(invalidQty);
console.log('Invalid Qty:', !resQty.valid, resQty.errors[0]?.message.includes('positive number') ? 'OK' : resQty.errors);
