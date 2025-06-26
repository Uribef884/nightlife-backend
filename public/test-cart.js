document.addEventListener("DOMContentLoaded", () => {
  const ticketIdInput = document.getElementById("ticketId");
  const dateInput = document.getElementById("ticketDate");
  const quantityInput = document.getElementById("quantity");
  const output = document.getElementById("output");

  function logResult(res) {
    output.textContent = JSON.stringify(res, null, 2);
  }

  document.getElementById("addBtn").addEventListener("click", async () => {
    const res = await fetch("/cart/add", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: ticketIdInput.value,
        date: dateInput.value,
        quantity: parseInt(quantityInput.value),
      }),
    });
    logResult(await res.json());
  });

  document.getElementById("viewBtn").addEventListener("click", async () => {
    const res = await fetch("/cart", {
      credentials: "include",
    });
    logResult(await res.json());
  });

  document.getElementById("updateBtn").addEventListener("click", async () => {
    const res = await fetch("/cart/update", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: ticketIdInput.value,
        date: dateInput.value,
        quantity: parseInt(quantityInput.value),
      }),
    });
    logResult(await res.json());
  });

  document.getElementById("removeBtn").addEventListener("click", async () => {
    const res = await fetch("/cart/remove", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: ticketIdInput.value,
        date: dateInput.value,
      }),
    });
    logResult(await res.json());
  });
});
