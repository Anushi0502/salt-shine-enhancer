package com.saltonlinestore.saltstoreandroid.ui;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.recyclerview.widget.LinearLayoutManager;

import com.google.android.material.bottomsheet.BottomSheetDialogFragment;
import com.saltonlinestore.saltstoreandroid.MainActivity;
import com.saltonlinestore.saltstoreandroid.R;
import com.saltonlinestore.saltstoreandroid.ui.adapter.SupportActionAdapter;
import com.saltonlinestore.saltstoreandroid.ui.secondary.SecondaryHostActivity;

import java.util.ArrayList;
import java.util.List;

public class BrowseSheetFragment extends BottomSheetDialogFragment {
    private SupportActionAdapter adapter;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_browse_sheet, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        TextView subtitle = view.findViewById(R.id.browse_sheet_subtitle);
        subtitle.setText("Wishlist, cart, recent checkouts, and recently viewed live here.");

        androidx.recyclerview.widget.RecyclerView list = view.findViewById(R.id.browse_actions);
        adapter = new SupportActionAdapter(action -> {
            dismissAllowingStateLoss();
            MainActivity activity = (MainActivity) requireActivity();
            switch (action.title) {
                case "Wishlist":
                    activity.openSecondaryScreen(SecondaryHostActivity.SCREEN_WISHLIST);
                    break;
                case "Cart":
                    activity.openSecondaryScreen(SecondaryHostActivity.SCREEN_CART);
                    break;
                case "Recent checkouts":
                    activity.openSecondaryScreen(SecondaryHostActivity.SCREEN_ORDER_HISTORY);
                    break;
                case "Recently viewed":
                    activity.openSecondaryScreen(SecondaryHostActivity.SCREEN_RECENTLY_VIEWED);
                    break;
                default:
                    break;
            }
        });
        list.setLayoutManager(new LinearLayoutManager(requireContext()));
        list.setAdapter(adapter);
        list.setNestedScrollingEnabled(false);

        List<SupportAction> actions = new ArrayList<>();
        actions.add(new SupportAction(android.R.drawable.btn_star_big_on, "Wishlist", "Reopen the products you saved"));
        actions.add(new SupportAction(android.R.drawable.ic_menu_agenda, "Cart", "See staged items before checkout"));
        actions.add(new SupportAction(android.R.drawable.ic_menu_recent_history, "Recent checkouts", "Review checkout handoffs saved on this device"));
        actions.add(new SupportAction(android.R.drawable.ic_menu_view, "Recently viewed", "Jump back to products you've opened"));
        adapter.submit(actions);
    }
}
