import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Club } from "../entities/Club";
import { MenuCartItem } from "../entities/MenuCartItem";
import { AuthenticatedRequest } from "../types/express";

// Get current menu configuration
export const getMenuConfig = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;

    // Only club owners and admins can access menu configuration
    if (user.role !== "admin" && user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can access menu configuration" });
      return;
    }

    // For non-admin users, they must have a clubId
    if (user.role !== "admin" && !user.clubId) {
      res.status(400).json({ error: "User is not associated with any club" });
      return;
    }

    // Use user's clubId (admins will need a different endpoint to manage multiple clubs)
    const clubId = user.clubId!;

    const clubRepo = AppDataSource.getRepository(Club);
    const club = await clubRepo.findOne({ 
      where: { id: clubId },
      relations: ["menuCategories", "menuItems"]
    });

    if (!club) {
      res.status(404).json({ error: "Club not found" });
      return;
    }

    const hasStructuredMenu = club.menuItems && club.menuItems.length > 0;
    const hasPdfMenu = !!club.pdfMenuUrl;

    res.json({
      clubId: club.id,
      clubName: club.name,
      menuType: club.menuType,
      hasStructuredMenu,
      hasPdfMenu,
      structuredItemCount: club.menuItems?.length || 0,
      pdfMenuName: club.pdfMenuName,
      pdfMenuUrl: club.pdfMenuUrl,
      description: club.menuType === "none" 
        ? "No menu available"
        : club.menuType === "pdf"
        ? "PDF menu available"
        : "Structured menu with cart functionality"
    });
  } catch (error) {
    console.error("Error getting menu config:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Switch menu type
export const switchMenuType = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { menuType } = req.body;
    const user = req.user!;

    // Only club owners and admins can change menu configuration
    if (user.role !== "admin" && user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can change menu configuration" });
      return;
    }

    // For non-admin users, they must have a clubId
    if (user.role !== "admin" && !user.clubId) {
      res.status(400).json({ error: "User is not associated with any club" });
      return;
    }

    if (!menuType || !["structured", "pdf", "none"].includes(menuType)) {
      res.status(400).json({ error: "Invalid menu type. Must be 'structured', 'pdf', or 'none'" });
      return;
    }

    const clubId = user.clubId!;
    const clubRepo = AppDataSource.getRepository(Club);
    const club = await clubRepo.findOne({ where: { id: clubId } });

    if (!club) {
      res.status(404).json({ error: "Club not found" });
      return;
    }

    // If switching away from structured mode, clear all cart items for this club
    if (club.menuType === "structured" && (menuType === "pdf" || menuType === "none")) {
      const cartRepo = AppDataSource.getRepository(MenuCartItem);
      await cartRepo.delete({ clubId });
    }

    // Update menu type
    const previousMenuType = club.menuType;
    club.menuType = menuType;
    await clubRepo.save(club);

    // Create appropriate response message based on the switch
    let message = `Menu type switched to ${menuType}`;
    let warning = null;

    if (previousMenuType === "structured" && menuType === "pdf") {
      message = "Menu switched to PDF mode";
      warning = "Your structured menu items are now hidden from customers. Only the uploaded PDF menu will be visible. You can switch back to structured mode anytime to restore menu item visibility.";
    } else if (previousMenuType === "structured" && menuType === "none") {
      message = "Menu disabled";
      warning = "Your structured menu items are now hidden from customers. No menu will be available until you switch to structured or PDF mode.";
    } else if (previousMenuType === "pdf" && menuType === "structured") {
      message = "Menu switched to structured mode - your menu items are now visible to customers";
    } else if (previousMenuType === "none" && menuType === "structured") {
      message = "Menu enabled - your structured menu items are now visible to customers";
    } else if (menuType === "pdf") {
      message = "Menu switched to PDF mode - upload a PDF to make it visible to customers";
    }

    const response: any = {
      message,
      menuType: club.menuType,
      clubId: club.id
    };

    if (warning) {
      response.warning = warning;
    }

    res.json(response);
  } catch (error) {
    console.error("Error switching menu type:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// PDF menu management is now handled by /upload/menu/pdf and /upload/menu/pdf DELETE 