import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma-client/prisma-client';

const app = express();
const prisma = new PrismaClient();

app.use(express.json()); // Use JSON body parsing [cite: 37, 228]

app.post('/identify', async (req: Request, res: Response) => {
    const { email, phoneNumber } = req.body;

    // Validate input: At least one must be present
    if (!email && !phoneNumber) {
        return res.status(400).json({ error: "Email or phone number is required." });
    }

    try {
        // 1. Find any existing contacts that match the email OR phone
        const directMatches = await prisma.contact.findMany({
            where: {
                OR: [
                    { email: email ? String(email) : undefined },
                    { phoneNumber: phoneNumber ? String(phoneNumber) : undefined }
                ]
            }
        });

        // 2. No matches? Create a new primary contact 
        if (directMatches.length === 0) {
            const newContact = await prisma.contact.create({
                data: {
                    email: email ? String(email) : null,
                    phoneNumber: phoneNumber ? String(phoneNumber) : null,
                    linkPrecedence: "primary"
                }
            });

            return res.status(200).json({
                contact: {
                    primaryContatctId: newContact.id,
                    emails: newContact.email ? [newContact.email] : [],
                    phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
                    secondaryContactIds: []
                }
            });
        }

        // 3. Matches found. Find the ultimate "Primary" contacts for all matches.
        // Secondaries always link directly to a primary[cite: 26]. 
        const primaryIds = new Set<number>();
        directMatches.forEach(contact => {
            if (contact.linkPrecedence === 'primary') {
                primaryIds.add(contact.id);
            } else if (contact.linkedId) {
                primaryIds.add(contact.linkedId);
            }
        });

        // 4. Fetch the full "family tree" of all related contacts
        const allRelatedContacts = await prisma.contact.findMany({
            where: {
                OR: [
                    { id: { in: Array.from(primaryIds) } },
                    { linkedId: { in: Array.from(primaryIds) } }
                ]
            },
            orderBy: { createdAt: 'asc' } // Oldest first
        });

        // 5. The oldest contact is our Root Primary [cite: 26]
        const rootPrimary = allRelatedContacts[0];

        // 6. Merge other primaries into secondaries if needed [cite: 144]
        const otherPrimaries = allRelatedContacts.filter(c => c.id !== rootPrimary.id && c.linkPrecedence === 'primary');

        if (otherPrimaries.length > 0) {
            const idsToUpdate = otherPrimaries.map(c => c.id);
            await prisma.contact.updateMany({
                where: { id: { in: idsToUpdate } },
                data: { linkPrecedence: 'secondary', linkedId: rootPrimary.id }
            });

            // Also update any secondaries that were pointing to the old primaries
            await prisma.contact.updateMany({
                where: { linkedId: { in: idsToUpdate } },
                data: { linkedId: rootPrimary.id }
            });
        }

        // 7. Check if we need to add a new secondary contact 
        // Are the incoming email/phone entirely new to this family tree?
        const hasExistingEmail = allRelatedContacts.some(c => c.email === email);
        const hasExistingPhone = allRelatedContacts.some(c => c.phoneNumber === String(phoneNumber));

        if (email && phoneNumber && (!hasExistingEmail || !hasExistingPhone)) {
            const newSecondary = await prisma.contact.create({
                data: {
                    email: String(email),
                    phoneNumber: String(phoneNumber),
                    linkedId: rootPrimary.id,
                    linkPrecedence: 'secondary'
                }
            });
            allRelatedContacts.push(newSecondary); // Add to array for formatting output
        }

        // 8. Re-fetch or format the final response [cite: 44, 46]
        const finalContacts = allRelatedContacts.map(c => c.id === rootPrimary.id ? c : { ...c, linkPrecedence: 'secondary', linkedId: rootPrimary.id });

        // Extract unique, non-null emails and phone numbers
        const emails = Array.from(new Set([rootPrimary.email, ...finalContacts.map(c => c.email)])).filter(Boolean) as string[];
        const phoneNumbers = Array.from(new Set([rootPrimary.phoneNumber, ...finalContacts.map(c => c.phoneNumber)])).filter(Boolean) as string[];
        const secondaryContactIds = finalContacts.filter(c => c.id !== rootPrimary.id).map(c => c.id);

        return res.status(200).json({
            contact: {
                primaryContatctId: rootPrimary.id,
                emails,
                phoneNumbers,
                secondaryContactIds
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});