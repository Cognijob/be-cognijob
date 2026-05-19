import nodemailer from "nodemailer";

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetLink = `${process.env.APP_BASE_URL || "http://localhost:3000"}/auth/reset-password?token=${token}`;
  
  console.log("=========================================");
  console.log(`[Email Service] Sending password reset email to: ${email}`);
  console.log(`[Email Service] Reset Link: ${resetLink}`);
  console.log("=========================================");

  // Send a real email if SMTP credentials are provided in env
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && port && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port: Number(port),
        auth: { user, pass }
      });

      await transporter.sendMail({
        from: `"CogniJob Support" <${user}>`,
        to: email,
        subject: "Atur Ulang Kata Sandi - CogniJob",
        text: `Silakan klik tautan berikut untuk mengatur ulang kata sandi Anda: ${resetLink}`,
        html: `<p>Silakan klik tautan berikut untuk mengatur ulang kata sandi Anda:</p><p><a href="${resetLink}">${resetLink}</a></p>`
      });
      console.log(`[Email Service] Password reset email sent to ${email} successfully.`);
    } catch (error) {
      console.error("[Email Service] Failed to send email via SMTP:", error);
    }
  }
}
