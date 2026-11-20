const form = document.getElementById("email-form");
const confirmation = document.getElementById("confirmation");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  confirmation.textContent = "Email accepted for this demo.";
});
