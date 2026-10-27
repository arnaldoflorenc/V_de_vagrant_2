// Rotas protegidas (/api/scripts e /api/ambientes). 
// O router.use garante que toda rota deste arquivo precise de um token válido.
const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { listScripts, createScript, deleteScript } = require("../controllers/scriptController");
const {
    listAmbientes,
    getAmbiente,
    createAmbiente,
    getLogs,
    stopAmbiente,
    deleteAmbiente
} = require("../controllers/ambienteController");

const router = express.Router();

router.use(requireAuth);

router.get("/scripts", listScripts);
router.post("/scripts", createScript);
router.delete("/scripts/:id", deleteScript);

router.get("/ambientes", listAmbientes);
router.post("/ambientes", createAmbiente);
router.get("/ambientes/:id", getAmbiente);
router.get("/ambientes/:id/logs", getLogs);
router.post("/ambientes/:id/parar", stopAmbiente);
router.delete("/ambientes/:id", deleteAmbiente);

module.exports = router;
