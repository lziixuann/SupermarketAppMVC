const gen = require('../utils/generateInvoice');
const id = Number(process.argv[2] || 4);
(async ()=>{
  try {
    const filename = await gen(id);
    console.log('OK', filename);
    process.exit(0);
  } catch (e) {
    console.error('ERR', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
