import requests
import sqlite3
import json
import sys

# Ensure UTF-8 output on Windows terminal
sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://localhost:8000/api/commerce"

def verify_end_to_end_flow():
    print("==================================================")
    print("STARTING COMPLETE END-TO-END E-COMMERCE FLOW TEST")
    print("==================================================")

    # Step 1: Create Direct Order with Quantity 2
    create_payload = {
        "buyer_id": "test_buyer_1",
        "listing_id": 1,
        "quantity": 2.0,
        "language": "ta-IN"
    }
    print(f"\n[1] Creating direct order: {create_payload}")
    r = requests.post(f"{BASE_URL}/order/create", json=create_payload)
    assert r.status_code == 200, f"Create order failed: {r.text}"
    order_data = r.json()
    order_id = order_data["order_id"]
    print(f" -> Order created successfully! Order #{order_id}, Status: {order_data['order_status']}, Total: Rs.{order_data['total_amount']}")
    assert order_data["order_status"] == "order_placed"

    # Verify SQLite persistence is strictly in English
    conn = sqlite3.connect("voice_agent.db")
    c = conn.cursor()
    c.execute("SELECT status, item_title, quantity, unit, total_amount FROM orders WHERE id=?", (order_id,))
    db_row = c.fetchone()
    print(f" -> DB Row in 'orders' (Strictly English invariant): {db_row}")
    assert db_row[0] == "order_placed"

    # Step 2: Pay Order (10s payment completion)
    pay_payload = {
        "order_id": order_id,
        "buyer_id": "test_buyer_1",
        "language": "ta-IN"
    }
    print(f"\n[2] Completing payment for Order #{order_id}...")
    r = requests.post(f"{BASE_URL}/order/pay", json=pay_payload)
    assert r.status_code == 200, f"Pay failed: {r.text}"
    pay_data = r.json()
    print(f" -> Payment confirmed! Status: {pay_data['order_status']}, Localized: {pay_data['status_localized']}")
    assert pay_data["order_status"] == "payment_completed"

    # Step 3: Seller Dashboard - New Buyer Orders
    print(f"\n[3] Checking Seller New Buyer Orders for seller 'test_seller_1'...")
    r = requests.get(f"{BASE_URL}/orders/seller/pending/test_seller_1?language=ta-IN")
    assert r.status_code == 200, f"Pending orders failed: {r.text}"
    pending_data = r.json()
    matching_pending = [o for o in pending_data["orders"] if o["order_id"] == order_id]
    assert len(matching_pending) == 1, "Order not found in seller new buyer orders!"
    po = matching_pending[0]
    print(f" -> Found order in New Buyer Orders! Product: {po['item_title']}, Qty: {po['quantity']} {po['unit']}, Total: Rs.{po['total_amount']}")

    # Step 4: Seller Action 1 - Pack Order
    pack_payload = {
        "order_id": order_id,
        "seller_id": "test_seller_1",
        "language": "ta-IN"
    }
    print(f"\n[4] Seller packing Order #{order_id}...")
    r = requests.post(f"{BASE_URL}/order/pack", json=pack_payload)
    assert r.status_code == 200, f"Pack failed: {r.text}"
    pack_data = r.json()
    print(f" -> Order packed! Status: {pack_data['order_status']}, Localized: {pack_data['status_localized']}")
    assert pack_data["order_status"] == "order_packed"

    # Step 5: Seller Action 2 - Schedule Pickup
    pickup_payload = {
        "order_id": order_id,
        "seller_id": "test_seller_1",
        "language": "ta-IN"
    }
    print(f"\n[5] Seller scheduling pickup for Order #{order_id}...")
    r = requests.post(f"{BASE_URL}/order/schedule-pickup", json=pickup_payload)
    assert r.status_code == 200, f"Schedule pickup failed: {r.text}"
    pickup_data = r.json()
    print(f" -> Pickup scheduled! Logistics: {pickup_data['delivery_partner']}, Tracking: {pickup_data['tracking_id']}")
    assert pickup_data["order_status"] == "pickup_scheduled"

    # Step 6: Package Moving State (Dispatched)
    dispatch_payload = {
        "order_id": order_id,
        "language": "ta-IN"
    }
    print(f"\n[6] Logistics handover -> Package Moving for Order #{order_id}...")
    r = requests.post(f"{BASE_URL}/order/dispatch", json=dispatch_payload)
    assert r.status_code == 200, f"Dispatch failed: {r.text}"
    dispatch_data = r.json()
    print(f" -> Package Moving! Status: {dispatch_data['order_status']}, Localized: {dispatch_data['status_localized']}")
    assert dispatch_data["order_status"] == "package_moving"

    # Step 7: Real-time visibility in Buyer Order History
    print(f"\n[7] Checking Buyer Order History for 'test_buyer_1'...")
    r = requests.get(f"{BASE_URL}/orders/buyer/history/test_buyer_1?language=ta-IN")
    assert r.status_code == 200
    buyer_hist = r.json()
    bh_order = [o for o in buyer_hist["orders"] if o["order_id"] == order_id][0]
    print(f" -> Buyer sees order: Status = '{bh_order['status']}', Localized = '{bh_order['status_localized']}'")
    assert bh_order["status"] == "package_moving"

    # Step 8: Order Received Confirmation (Delivery Complete)
    receive_payload = {
        "order_id": order_id,
        "user_id": "test_buyer_1",
        "language": "ta-IN"
    }
    print(f"\n[8] Buyer confirming Order #{order_id} Received...")
    r = requests.post(f"{BASE_URL}/order/receive", json=receive_payload)
    assert r.status_code == 200, f"Order receive failed: {r.text}"
    rec_data = r.json()
    print(f" -> Order received confirmed! Status: {rec_data['order_status']}, Localized: {rec_data['status_localized']}")
    assert rec_data["order_status"] == "order_received"

    # Step 9: Seller Order History & Final Earnings
    print(f"\n[9] Checking Seller Order History & Final Earnings for 'test_seller_1'...")
    r = requests.get(f"{BASE_URL}/orders/seller/history/test_seller_1?language=ta-IN")
    assert r.status_code == 200
    seller_hist = r.json()
    print(f" -> Total Orders: {seller_hist['count']}, Total Earnings: Rs.{seller_hist['total_earnings']}")
    sh_order = [o for o in seller_hist["orders"] if o["order_id"] == order_id][0]
    assert sh_order["status"] == "order_received"
    assert sh_order["is_delivered"] is True

    # Step 10: Check Audit History Logs in SQLite
    c.execute("SELECT status, action, notes, created_at FROM order_history WHERE order_id=? ORDER BY id ASC", (order_id,))
    history_logs = c.fetchall()
    print(f"\n[10] SQLite Audit History Logs for Order #{order_id}:")
    for log in history_logs:
        print(f"   * Status: {log[0]} | Action: {log[1]} | Notes: {log[2]}")

    conn.close()
    print("\n==================================================")
    print("ALL 10 END-TO-END FLOW CHECKS PASSED WITH 100% SUCCESS!")
    print("==================================================")

if __name__ == "__main__":
    verify_end_to_end_flow()
