package com.saltonlinestore.saltstoreandroid.ui;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.saltonlinestore.saltstoreandroid.MainActivity;
import com.saltonlinestore.saltstoreandroid.R;
import com.saltonlinestore.saltstoreandroid.ui.adapter.SupportActionAdapter;
import com.saltonlinestore.saltstoreandroid.ui.ContactSupportSheetFragment;
import com.saltonlinestore.saltstoreandroid.ui.policy.NativePolicyActivity;
import com.saltonlinestore.saltstoreandroid.ui.secondary.SecondaryHostActivity;
import com.saltonlinestore.saltstoreandroid.util.StoreUrls;

import java.util.ArrayList;
import java.util.List;

public class MoreFragment extends Fragment {
    private SupportActionAdapter adapter;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_more, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        RecyclerView list = view.findViewById(R.id.more_actions);
        adapter = new SupportActionAdapter(action -> {
            switch (action.title) {
                case "Shipping & delivery":
                    NativePolicyActivity.open(requireContext(), action.title, action.subtitle, StoreUrls.shippingPolicyUrl());
                    break;
                case "Returns & refunds":
                    NativePolicyActivity.open(requireContext(), action.title, action.subtitle, StoreUrls.refundPolicyUrl());
                    break;
                case "Contact support":
                    new ContactSupportSheetFragment().show(getParentFragmentManager(), "contact_support_sheet");
                    break;
                case "Order history":
                    openSecondaryScreen(SecondaryHostActivity.SCREEN_ORDER_HISTORY);
                    break;
                case "Privacy policy":
                    NativePolicyActivity.open(requireContext(), action.title, action.subtitle, StoreUrls.privacyPolicyUrl());
                    break;
                case "FAQs":
                    NativePolicyActivity.open(requireContext(), action.title, action.subtitle, StoreUrls.faqUrl());
                    break;
                default:
                    break;
            }
        });

        list.setLayoutManager(new LinearLayoutManager(requireContext()));
        list.setAdapter(adapter);
        list.setNestedScrollingEnabled(false);

        refreshData();
    }

    public void refreshData() {
        List<SupportAction> actions = new ArrayList<>();
        actions.add(new SupportAction(android.R.drawable.ic_menu_send, "Shipping & delivery", "See shipping and fulfillment terms"));
        actions.add(new SupportAction(android.R.drawable.ic_menu_delete, "Returns & refunds", "Review return and refund terms"));
        actions.add(new SupportAction(android.R.drawable.ic_menu_call, "Contact support", "Open support actions and contact info"));
        actions.add(new SupportAction(android.R.drawable.ic_menu_recent_history, "Order history", "Review saved checkout handoffs"));
        actions.add(new SupportAction(android.R.drawable.ic_menu_info_details, "Privacy policy", "Read app and store privacy details"));
        actions.add(new SupportAction(android.R.drawable.ic_menu_help, "FAQs", "Quick answers about checkout and support"));
        adapter.submit(actions);
    }

    private void openSecondaryScreen(@NonNull String screen) {
        if (requireActivity() instanceof MainActivity mainActivity) {
            mainActivity.openSecondaryScreen(screen);
        } else if (requireActivity() instanceof SecondaryHostActivity secondaryHostActivity) {
            secondaryHostActivity.finish();
            secondaryHostActivity.startActivity(new android.content.Intent(secondaryHostActivity, SecondaryHostActivity.class)
                    .putExtra(SecondaryHostActivity.EXTRA_SCREEN, screen));
        }
    }
}
