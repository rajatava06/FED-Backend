const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { ApiError } = require("../../utils/error/ApiError");
const expressAsyncHandler = require("express-async-handler");

//@description     Remove a member from a team
//@route           DELETE /api/form/removeMember/:formId
//@access          Private (requires user to be team creator or admin)
const removeMember = expressAsyncHandler(async (req, res, next) => {
    try {
        const { formId } = req.params;
        const { memberEmail } = req.body;
        const { email, access } = req.user;

        if (!formId) {
            return next(new ApiError(400, "Form ID is required"));
        }

        if (!memberEmail) {
            return next(new ApiError(400, "Member email is required"));
        }

        // Find the team registration
        const teamRegistration = await prisma.formRegistration.findFirst({
            where: {
                formId: formId,
                regTeamMemEmails: {
                    has: email
                }
            },
            include: {
                user: {
                    select: {
                        email: true
                    }
                },
                form: {
                    select: {
                        info: true
                    }
                }
            }
        });

        if (!teamRegistration) {
            return next(new ApiError(404, "No team registration found for this user in the specified form"));
        }

        // Check if this is a team event
        const isTeamEvent = teamRegistration.form.info.participationType === "Team";
        if (!isTeamEvent) {
            return next(new ApiError(400, "This is not a team event"));
        }

        // Authorization check: only team creator or admin can remove members
        const isTeamCreator = teamRegistration.user.email === email;
        const isAdmin = access === "ADMIN";

        if (!isTeamCreator && !isAdmin) {
            return next(new ApiError(403, "Only the team creator or admin can remove members"));
        }

        // Check if the member to be removed is in the team
        if (!teamRegistration.regTeamMemEmails.includes(memberEmail)) {
            return next(new ApiError(404, "Member not found in this team"));
        }

        // Prevent removing the last member
        if (teamRegistration.regTeamMemEmails.length === 1) {
            return next(new ApiError(400, "Cannot remove the last member from the team"));
        }

        // Remove the member from the team
        const updatedTeamMembers = teamRegistration.regTeamMemEmails.filter(
            email => email !== memberEmail
        );

        const updatedRegistration = await prisma.formRegistration.update({
            where: {
                id: teamRegistration.id
            },
            data: {
                regTeamMemEmails: updatedTeamMembers,
                teamSize: updatedTeamMembers.length
            }
        });

        // Fetch updated team members info
        const teamMembers = await prisma.user.findMany({
            where: {
                email: {
                    in: updatedRegistration.regTeamMemEmails
                }
            },
            select: {
                name: true,
                email: true,
                img: true,
                rollNumber: true,
                college: true,
                year: true
            }
        });

        const teamDetails = {
            teamName: updatedRegistration.teamName,
            teamCode: updatedRegistration.teamCode,
            teamSize: updatedRegistration.teamSize,
            maxTeamSize: teamRegistration.form.info.maxTeamSize || 1,
            members: teamMembers,
            eventTitle: teamRegistration.form.info.eventTitle
        };

        res.status(200).json({
            success: true,
            message: "Member removed successfully",
            data: teamDetails
        });

    } catch (error) {
        console.error("Error removing team member:", error);
        next(new ApiError(500, "Error removing team member", error));
    }
});

module.exports = { removeMember };
