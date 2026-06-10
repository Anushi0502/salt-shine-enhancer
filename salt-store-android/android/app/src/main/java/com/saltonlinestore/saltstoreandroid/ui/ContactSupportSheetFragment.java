package com.saltonlinestore.saltstoreandroid.ui;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.google.android.material.bottomsheet.BottomSheetDialogFragment;
import com.google.android.material.button.MaterialButton;
import com.saltonlinestore.saltstoreandroid.R;
import com.saltonlinestore.saltstoreandroid.ui.policy.NativePolicyActivity;
import com.saltonlinestore.saltstoreandroid.util.StoreUrls;

public class ContactSupportSheetFragment extends BottomSheetDialogFragment {
    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_contact_support_sheet, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        MaterialButton contactPageButton = view.findViewById(R.id.contact_support_page);
        MaterialButton instagramButton = view.findViewById(R.id.contact_support_instagram);
        MaterialButton facebookButton = view.findViewById(R.id.contact_support_facebook);
        MaterialButton youtubeButton = view.findViewById(R.id.contact_support_youtube);

        contactPageButton.setOnClickListener(v -> {
            dismissAllowingStateLoss();
            NativePolicyActivity.open(requireContext(), "Contact support", "Store contact details", StoreUrls.contactInformationUrl());
        });
        instagramButton.setOnClickListener(v -> {
            dismissAllowingStateLoss();
            openExternal("https://www.instagram.com/saltonlinestore");
        });
        facebookButton.setOnClickListener(v -> {
            dismissAllowingStateLoss();
            openExternal("https://www.facebook.com/people/SALT-online-store/61573199456052/");
        });
        youtubeButton.setOnClickListener(v -> {
            dismissAllowingStateLoss();
            openExternal("https://www.youtube.com/@SALTONLINESTORE");
        });
    }

    private void openExternal(@NonNull String url) {
        if (getActivity() instanceof com.saltonlinestore.saltstoreandroid.MainActivity mainActivity) {
            mainActivity.openExternal(url);
            return;
        }
        if (getActivity() != null) {
            android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url));
            getActivity().startActivity(intent);
        }
    }
}
