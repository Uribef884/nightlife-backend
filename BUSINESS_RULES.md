# 🎯 Nightlife Backend - Business Rules Documentation

## 📋 Table of Contents

1. [🔐 Authentication & Authorization](#-authentication--authorization)
2. [🏢 Clubs](#-clubs)
3. [🎟️ Tickets](#️-tickets)
4. [🎉 Events](#-events)
5. [🛒 Cart Systems](#-cart-systems)
6. [💳 Checkout](#-checkout)
7. [📱 QR Validation](#-qr-validation)
8. [🍽️ Menu System](#️-menu-system)
9. [📊 Purchase History](#-purchase-history)
10. [📢 Ads](#-ads)
11. [👥 Staff Management](#-staff-management)
12. [📁 File Uploads](#-file-uploads)
13. [👑 Admin Actions](#-admin-actions)
14. [💰 Dynamic Pricing](#-dynamic-pricing)
15. [🗄️ Data Integrity](#️-data-integrity)
16. [🗓️ Calendar & Date Selection](#️-calendar--date-selection)
17. [📧 Email Validation](#-email-validation)
18. [🎯 Frontend Implementation](#-frontend-implementation)

---

## 🔐 Authentication & Authorization

### **Input Rules**
- **Email**: Required, valid format, sanitized and normalized to lowercase
- **Password**: Required, minimum 6 characters, hashed with bcrypt
- **Token**: JWT token required for authenticated routes (Authorization header or cookie)

### **Validation Rules**
- Account deletion check: Deleted accounts cannot authenticate
- Role-based access control: 5 distinct roles (admin, clubowner, bouncer, waiter, user)
- Session management: Anonymous users get sessionId, authenticated users get userId

### **Role Rules**
| Role | Permissions |
|------|-------------|
| **Admin** | Full system access, manage any club, create global ads |
| **ClubOwner** | Manage own club, create/edit tickets, events, menu items |
| **Bouncer** | Validate ticket QRs for assigned club only |
| **Waiter** | Validate menu QRs for assigned club only |
| **User** | Purchase tickets and menu items, view own purchases |

### **Display Rules**
- Show different UI based on authentication status
- Anonymous users can browse but need to authenticate for purchases
- Role-specific navigation and functionality

---

## 🏢 Clubs

### **Input Rules**
- **name**: Required, sanitized string
- **description**: Required, sanitized text
- **address**: Required, sanitized string
- **city**: Defaults to "Medellín"
- **musicType**: Array of strings
- **openDays**: Array of day names (Sunday, Monday, etc.)
- **openHours**: JSON array with day, open, close times
- **latitude/longitude**: Optional float coordinates
- **instagram/whatsapp**: Optional social media links
- **dressCode**: Optional string
- **minimumAge**: Optional number
- **priority**: Integer for display order

### **Validation Rules**
- Only admins can create clubs
- Club owners can only update their own club
- Cannot delete clubs with active tickets or events
- Profile image upload required for visual display

### **Display Rules**
- Show clubs ordered by priority
- Filter by city, music type, open days
- Display open/closed status based on current time
- Show profile image with blur hash for loading

### **Role Rules**
| Role | Permissions |
|------|-------------|
| **Admin** | Create, view, edit any club |
| **ClubOwner** | Only view/edit own club |
| **Public** | View active clubs only |

---

## 🎟️ Tickets

### **Input Rules**
- **name**: Required, sanitized string (max 500 chars)
- **description**: Optional, sanitized text
- **price**: Required number ≥ 0
- **maxPerPerson**: Required integer > 0
- **priority**: Required integer ≥ 1
- **category**: Required enum (general, event, free)
- **quantity**: Required for free/event tickets, null for general
- **availableDate**: Required for free tickets, null for general, inherited for event
- **eventId**: Required for event tickets, null for others
- **dynamicPricingEnabled**: Boolean, defaults to true
- **includesMenuItem**: Boolean, defaults to false
- **menuItems**: Array of included menu items (if includesMenuItem = true)

### **Category-Specific Rules**

#### **General Tickets (Covers)**
- **price**: Must be > 0
- **availableDate**: Must be null
- **quantity**: Must be null
- **eventId**: Must be null
- **dynamicPricing**: Can be enabled/disabled

#### **Free Tickets**
- **price**: Must be exactly 0
- **availableDate**: Required, cannot be in past
- **quantity**: Required, must be > 0
- **eventId**: Must be null
- **dynamicPricing**: Cannot be enabled (always fixed at 0)
- **Date Selection**: Auto-selected date (similar to event tickets)

#### **Event Tickets**
- **price**: Must be ≥ 0
- **availableDate**: Inherited from event (not null, but inherited)
- **quantity**: Required, must be > 0
- **eventId**: Required, must reference valid event
- **dynamicPricing**: Can be enabled/disabled

### **Validation Rules**
- Cannot switch between free and paid on update
- Cannot add availableDate if eventId is present
- Cannot update eventId once set
- Free tickets cannot have dynamic pricing enabled
- Menu items included in tickets must belong to same club
- Cannot link parent menu items with variants directly
- Cannot link menu items without variants when variant is specified
- Cannot create events when another event exists for same date
- Cannot create free tickets when events exist for same date
- Free tickets are hidden from display when events exist for same date

### **Display Rules**
- Only show active tickets (isActive = true) unless admin/club owner
- Filter out expired/past-date tickets on fetch
- Show sold out status when quantity = 0
- Display dynamic pricing when enabled
- Show included menu items for tickets with includesMenuItem = true
- **Event tickets**: Auto-select event date
- **Free tickets**: Auto-select availableDate
- Hide free tickets when events exist for same date

### **Role Rules**
| Role | Permissions |
|------|-------------|
| **Admin** | View/edit all tickets |
| **ClubOwner** | View/edit own club's tickets |
| **User** | See active, non-deleted, public tickets (with free ticket filtering applied) |

---

## 🎉 Events

### **Input Rules**
- **name**: Required, sanitized string
- **description**: Optional, sanitized text
- **availableDate**: Required, cannot be in past
- **openHours**: Required JSON with open/close times
- **bannerUrl**: Required, uploaded to S3

### **Validation Rules**
- Cannot update availableDate after creation
- openHours must have valid HH:MM format
- Banner image required for visual display
- Club ownership validation
- Only one event per date per club allowed

### **Display Rules**
- Show events ordered by availableDate
- Display banner image with blur hash
- Show open hours and event details
- Filter by club and active status

### **Implemented Validations**
1. **Event Creation Validation**:
   - Block multiple events per date: Check if another event exists for same date and club
   - Error message: "An event already exists for [date]. Only one event per date is allowed."

2. **Free Ticket Creation Validation**:
   - Block free tickets when events exist: Check if event exists for same date
   - Error message: "Cannot create free ticket for [date] because an event already exists for that date."

3. **Free Ticket Display Filtering**:
   - Hide free tickets when events exist: Filter out free tickets when events exist for same date
   - User experience: Users won't see conflicting free tickets when events are available

### **Business Logic Flow**
- **Event Creation**: ✅ Prevents duplicate events per date
- **Free Ticket Creation**: ✅ Prevents free tickets when events exist
- **Free Ticket Display**: ✅ Hides free tickets when events exist
- **General Ticket Cart**: ✅ Already prevents general tickets when events exist

### **Event Priority System**
- **Events** have highest priority
- **Free tickets** are hidden when events exist
- **General tickets** cannot be purchased when events exist

### **Validation Hierarchy**
1. Event creation → Check for existing events
2. Free ticket creation → Check for existing events
3. Free ticket display → Hide if events exist
4. General ticket purchase → Block if events exist

---

## 🛒 Cart Systems

### **Ticket Cart**

#### **Input Rules**
- **ticketId**: Required, must reference valid ticket
- **date**: Required, YYYY-MM-DD format
- **quantity**: Required, must be > 0

#### **Validation Rules**
- **Date Validation**: Cannot select past dates
- **Ticket Availability**: Ticket must be active and not sold out
- **Quantity Limits**: Cannot exceed maxPerPerson for ticket
- **Event Grace Period**: Event tickets can be purchased after event has started (1 hour grace period, always active regardless of dynamic pricing with 30% charge on normal price)
- **Cart Exclusivity**: Cannot mix ticket cart with menu cart
- **Club Consistency**: All tickets must be from same club
- **Date Consistency**: All tickets must be for same date
- **Event Priority**: Event tickets cannot coexist with other tickets

#### **General Ticket Rules**
- **Calendar Restriction**: Cannot buy general cover if paid event exists for that date (date should be greyed out in calendar)
- Must be within 3 weeks of current date
- Must be on club's open days

#### **Free Ticket Rules**
- Must be purchased on availableDate only (auto-selected)

#### **Display Rules**
- Show cart items with dynamic pricing
- Display club and date information
- Show quantity limits and availability
- Calculate totals with fees

#### **Role Rules**
- Anonymous users can use cart with sessionId
- Authenticated users can use cart with userId
- Cart persists across sessions for authenticated users

### **Menu Cart**

#### **Input Rules**
- **menuItemId**: Required, must reference valid menu item
- **variantId**: Required if menu item has variants
- **quantity**: Required, must be > 0

#### **Validation Rules**
- **Cart Exclusivity**: Cannot mix menu cart with ticket cart
- **Club Consistency**: All items must be from same club
- **Menu Type**: Club must be in "structured" menu mode
- **Item Availability**: Menu item must be active

#### **Variant Requirements**
- Must select variant if item has variants
- Cannot select variant if item has no variants
- Quantity Limits: Cannot exceed maxPerPerson for item/variant
- Dynamic Pricing: Applied based on club open hours

#### **Display Rules**
- Show items with variants and quantities
- Display dynamic pricing when enabled
- Calculate totals with fees
- Show club information

#### **Role Rules**
- Anonymous users can use cart with sessionId
- Authenticated users can use cart with userId
- Cart persists across sessions for authenticated users

---

## 💳 Checkout

### **Ticket Checkout Rules**
- **Fees**: Users see basic breakdown - Platform Fee + Items Total = Total Paid
- **QR Generation**: Encrypted QR code generated for each purchase
- **Confirmation**: Two-step process (initiate → confirm)
- **Payment**: Mock Wompi integration for testing
- **Email**: Purchase confirmation sent to buyer

### **Menu Checkout Rules**
- **Fees**: Users see basic breakdown - Platform Fee + Items Total = Total Paid
- **QR Generation**: Single QR code for entire transaction
- **Confirmation**: Two-step process (initiate → confirm)
- **Payment**: Mock Wompi integration for testing
- **Email**: Purchase confirmation sent to buyer

### **Validation Rules**
- Cart must not be empty
- All items must be from same club
- User must provide valid email
- Payment must be confirmed before QR generation
- **Email Validation**: No disposable emails allowed

---

## 📱 QR Validation

### **Ticket QR Rules**
- **Access**: Only bouncers and club owners can validate
- **Club Access**: Must belong to same club as ticket
- **Date Validation**: Only valid on event date until 1 AM next day
- **Single Use**: QR can only be used once
- **Grace Period**: 1 hour after event start time

### **Menu QR Rules**
- **Access**: Only waiters and club owners can validate
- **Club Access**: Must belong to same club as transaction
- **Single Use**: QR can only be used once
- **Transaction Scope**: Validates entire menu transaction

### **Menu from Ticket QR Rules**
- **Access**: Only waiters can validate
- **Club Access**: Must belong to same club as ticket
- **Date Validation**: Only valid on event date until 1 AM next day
- **Single Use**: QR can only be used once per ticket purchase

### **Display Rules**
- **Preview**: Show purchase details without marking as used
- **Confirm**: Mark as used and show confirmation
- **Error Handling**: Clear error messages for invalid QRs

---

## 🍽️ Menu System

### **Menu Configuration Rules**
- **Menu Types**: "structured", "pdf", "none" (mutually exclusive)
- **Switching**: Can switch between types, clears cart when switching away from structured
- **PDF Upload**: Required when menuType = "pdf"
- **Structured Items**: Required when menuType = "structured"

### **Menu Categories Rules**
- **name**: Required, sanitized string (max 500 chars)
- **isActive**: Boolean, defaults to true
- **clubId**: Required, must belong to club

### **Menu Items Rules**
- **name**: Required, sanitized string (max 500 chars)
- **description**: Optional, sanitized text
- **price**: Required if hasVariants = false, null if hasVariants = true
- **maxPerPerson**: Required if hasVariants = false, null if hasVariants = true
- **hasVariants**: Boolean, determines if item uses variants
- **dynamicPricingEnabled**: Boolean, cannot be enabled if hasVariants = true
- **categoryId**: Required, must reference valid category
- **imageUrl**: Optional, with blur hash for loading

### **Menu Variants Rules**
- **name**: Required, unique within menu item
- **price**: Required, must be > 0
- **maxPerPerson**: Optional, must be > 0 if provided
- **dynamicPricingEnabled**: Boolean, defaults to true
- **menuItemId**: Required, must reference valid menu item

### **Validation Rules**
- Cannot change hasVariants after creation
- Parent items with variants cannot have dynamic pricing
- Variants must have unique names within same item
- Cannot link parent items directly to tickets (must use variants)

### **Display Rules**
- Show items grouped by category
- Display variants when item has variants
- Show dynamic pricing when enabled
- Filter by club and active status

---

## 📊 Purchase History

### **Ticket Purchases Rules**
- **User View**: Can see own purchases with full details
- **Club Owner View**: Can see all purchases for their club
- **Admin View**: Can see all purchases across all clubs
- **QR Validation**: Shows validation history and usage status

### **Menu Purchases Rules**
- **User View**: Can see own transactions with item details
- **Club Owner View**: Can see all transactions for their club
- **Admin View**: Can see all transactions across all clubs
- **QR Validation**: Shows validation history and usage status

### **Display Rules**
- Show purchase date, items, quantities, prices
- Display QR usage status and timestamps
- Filter by date range and club
- Show buyer information for club owners/admins

---

## 📢 Ads

### **Input Rules**
- **image**: Required, processed and uploaded to S3
- **priority**: Required integer ≥ 1
- **isVisible**: Boolean, defaults to true
- **targetType**: Optional ("event" or "ticket")
- **targetId**: Required if targetType provided
- **clubId**: Required for club ads, null for global ads

### **Validation Rules**
- **Global Ads**: Only admins can create
- **Club Ads**: Club owners and admins can create
- **Rate Limiting**: Max 7 ads per club
- **Target Validation**: targetId must reference valid event/ticket
- **Image Processing**: Automatic blur hash generation

### **Display Rules**
- Show ads ordered by priority (DESC)
- Filter by visibility and active status
- Generate links based on targetType and targetId
- Display blur hash during image loading

### **Role Rules**
| Role | Permissions |
|------|-------------|
| **Admin** | Create global and club ads |
| **ClubOwner** | Only create ads for own club |
| **Public** | View visible ads |

---

## 👥 Staff Management

### **Bouncers Rules**
- **Creation**: Only admins and club owners can create
- **Email**: Required, used as username
- **Password**: Required, hashed with bcrypt
- **Club Assignment**: Must be assigned to specific club
- **Access**: Can validate ticket QRs for assigned club only

### **Waiters Rules**
- **Creation**: Only admins and club owners can create
- **Email**: Required, used as username
- **Password**: Required, hashed with bcrypt
- **Club Assignment**: Must be assigned to specific club
- **Access**: Can validate menu QRs for assigned club only

### **Validation Rules**
- Email must be unique across system
- Staff can only access their assigned club
- Cannot delete staff with active QR validations

---

## 📁 File Uploads

### **Image Upload Rules**
- **Formats**: JPEG, PNG, WebP
- **Size Limits**: Max 5MB
- **Processing**: Automatic resizing and blur hash generation
- **S3 Storage**: Organized by club and type
- **Cleanup**: Old images deleted when replaced

### **PDF Upload Rules**
- **Format**: PDF only
- **Size Limits**: Max 10MB
- **Usage**: Menu PDF for clubs in PDF mode
- **Storage**: S3 with organized naming

### **Validation Rules**
- File type validation
- Size limit enforcement
- Error handling for upload failures
- Automatic cleanup of old files

---

## 👑 Admin Actions

### **Global Management**
- Create tickets for any club
- Toggle visibility for any item
- Upload images for any club
- Create global ads
- Manage all users and roles

### **Club Management**
- Create/edit clubs
- Assign club owners
- Manage club staff (bouncers, waiters)
- View all club data

### **Data Management**
- Soft delete records with purchases
- Hard delete records without purchases
- Maintain data integrity
- Preserve purchase history

---

## 💰 Dynamic Pricing

### **General Covers**
- **Closed Day**: 30% discount (3+ hours before open)
- **Early**: 10% discount (≤3 hours before open)
- **Open**: Full price (during open hours)

### **Menu Items (Parent Items without Variants)**
- **Club Closed Days**: 30% discount
- **Club Open Days, 3+ hours before opening**: 30% discount
- **Club Open Days, < 3 hours before opening**: 10% discount
- **During Club Open Hours**: Base price (no discount)

### **Menu Item Variants**
- **Can have dynamic pricing enabled/disabled independently**
- **Default**: Dynamic pricing enabled (true)
- **Same rules as parent items**:
  - **Club Closed Days**: 30% discount
  - **Club Open Days, 3+ hours before opening**: 30% discount
  - **Club Open Days, < 3 hours before opening**: 10% discount
  - **During Club Open Hours**: Base price (no discount)

### **Event Tickets**
- **48+ hours**: 30% discount
- **24-48 hours**: Base price
- **<24 hours**: 20% surplus
- **Grace period**: 30% surplus (1 hour after start) - Always active regardless of dynamic pricing setting
- **Expired**: Blocked purchase (after 1 hour grace period)

### **Validation Rules**
- Free tickets cannot have dynamic pricing
- Parent menu items with variants cannot have dynamic pricing
- Menu item variants can have dynamic pricing enabled/disabled independently
- Dynamic pricing based on club open hours/open days and current time
- Event grace period is always active (1 hour after event start, regardless of dynamic pricing setting)

---

## 🗄️ Data Integrity

### **Soft Delete Rules**
- Records with purchases are soft deleted (marked as deleted but preserved)
- Records without purchases are hard deleted (completely removed)
- Purchase records are never deleted regardless of context

### **Cascade Rules**
- Deleting club cascades to tickets, events, menu items
- Deleting event cascades to tickets
- Deleting menu category cascades to menu items
- Deleting menu item cascades to variants

### **Validation Rules**
- Foreign key constraints enforced
- Referential integrity maintained
- Data consistency across all operations

---

## 🗓️ Calendar & Date Selection

### **General Ticket Calendar Rules**
- **Date Availability**: Only show dates within 3 weeks from current date
- **Club Open Days**: Only show dates when club is open
- **Event Conflicts**: Grey out dates that have paid events
- **Date Selection**: User must manually select date

### **Event Ticket Calendar Rules**
- **Date Selection**: Auto-selected to event date
- **No Manual Selection**: User cannot change event date
- **Display**: Show event date prominently

### **Free Ticket Calendar Rules**
- **Date Selection**: Auto-selected to availableDate
- **No Manual Selection**: User cannot change available date
- **Display**: Show available date prominently

### **Validation Rules**
- Past dates are never selectable
- Event dates are always valid for event tickets
- Available dates are always valid for free tickets
- General ticket dates must pass all validation rules

---

## 📧 Email Validation

### **Email Rules**
- **Format**: Must be valid email format
- **Disposable**: No disposable email addresses allowed
- **Required**: Email is required for all purchases
- **Confirmation**: Purchase confirmation sent to provided email

### **Validation Process**
- Check email format using regex
- Check against disposable email blocklist
- Sanitize and normalize email address
- Validate uniqueness for registration

---

## 🎯 Frontend Implementation

### **Calendar UI Behavior**
- **General Tickets**: Show selectable dates, grey out conflicting dates
- **Event Tickets**: Show event date as selected, disable date picker
- **Free Tickets**: Show available date as selected, disable date picker
- Free tickets should not appear in ticket lists when events exist for same date

### **Checkout UI Behavior**
- **Fee Display**: Simple breakdown - Platform Fee + Items Total = Total Paid
- **Email Validation**: Real-time validation against disposable email list
- **Payment Flow**: Two-step process with clear confirmation

### **Cart UI Behavior**
- **Date Selection**: Appropriate behavior based on ticket type
- **Validation**: Real-time validation with clear error messages
- **Exclusivity**: Clear messaging about cart type restrictions

### **Ticket Display Behavior**
- **Free Tickets**: Automatically hidden when events exist for same date
- **Event Priority**: Events take precedence over free tickets
- **User Experience**: Users only see relevant tickets without conflicts

### **Admin/ClubOwner Feedback**
- **Hidden Tickets Message**: Display message when free tickets are hidden
- **Ticket Count**: Show both visible and hidden ticket counts
- **Conflict Awareness**: Inform about event-ticket conflicts

---

## 📋 Response Format Examples

### **Ticket Display Response (with hidden tickets)**
```json
{
  "tickets": [...],
  "message": "2 free ticket(s) hidden because events exist for the same date(s)."
}
```

### **Event Creation Error**
```json
{
  "error": "An event already exists for 2024-01-15. Only one event per date is allowed."
}
```

### **Free Ticket Creation Error**
```json
{
  "error": "Cannot create free ticket for 2024-01-15 because an event already exists for that date."
}
```

---

This comprehensive business rules documentation ensures consistent behavior across the entire nightlife backend application and provides clear guidance for frontend implementation. 