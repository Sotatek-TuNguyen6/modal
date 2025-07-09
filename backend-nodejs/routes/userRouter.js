const express = require("express");
const router = express.Router();
const { createUser, getAllUsers, getUserById, updateUser, loginUser, registerUser, refreshToken, deleteUser } = require("../controllers/userController");

router.post("/create", createUser);
router.get("/all", getAllUsers);
router.get("/:id", getUserById);
router.put("/:id", updateUser);
router.post("/login", loginUser);
router.post("/register", registerUser);
router.post("/refresh", refreshToken);
router.delete("/:id", deleteUser);

module.exports = router;    
